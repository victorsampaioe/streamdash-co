import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { apiError, clientIp, enforceRateLimits, jsonResponse, safeLog } from '@/lib/api-security.server';
import { isSafeHttpsUrl } from '@/lib/ssrf-guard';

const idSchema = z.string().uuid();

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/** Branding público do revendedor: só dados exibíveis, sem IDs internos nem credenciais. */
export const Route = createFileRoute('/api/public/android/config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const resellerId = url.searchParams.get('reseller_id') ?? '';
          if (!idSchema.safeParse(resellerId).success) return apiError('invalid_payload');

          const limited = await enforceRateLimits([
            { rule: { bucket: 'android_config_ip', limit: 120, windowSeconds: 300 }, key: clientIp(request.headers) },
          ]);
          if (limited) return limited;

          const { data: config } = await supabaseAdmin
            .from('reseller_app_config')
            .select('app_name, logo_url, primary_color')
            .eq('reseller_id', resellerId)
            .maybeSingle();

          const logo = config?.logo_url && isSafeHttpsUrl(config.logo_url) ? config.logo_url : null;
          const color = config?.primary_color && HEX.test(config.primary_color) ? config.primary_color : '#3B82F6';

          return jsonResponse(
            {
              ok: true,
              app_name: (config?.app_name ?? 'Stream Monitor Play').slice(0, 60),
              logo_url: logo,
              primary_color: color,
              footer_text: 'Powered by Stream Monitor',
            },
            200,
            { 'Cache-Control': 'public, max-age=300' },
          );
        } catch (error) {
          safeLog('ANDROID CONFIG', 'erro interno', { error: (error as Error).message });
          return apiError('internal_error');
        }
      },
    },
  },
});
