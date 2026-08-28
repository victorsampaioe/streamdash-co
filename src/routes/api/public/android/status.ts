import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { apiError, clientIp, enforceRateLimits, jsonResponse, safeLog } from '@/lib/api-security.server';

const paramSchema = z.string().uuid();

/** Resumo de saúde do servidor — sem infraestrutura interna, IPs ou logs. */
export const Route = createFileRoute('/api/public/android/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const serverId = url.searchParams.get('server_id') ?? '';
          if (!paramSchema.safeParse(serverId).success) return apiError('invalid_payload');

          const limited = await enforceRateLimits([
            { rule: { bucket: 'android_status_ip', limit: 240, windowSeconds: 300 }, key: clientIp(request.headers) },
            { rule: { bucket: 'android_status_server', limit: 600, windowSeconds: 300 }, key: serverId },
          ]);
          if (limited) return limited;

          const { data: check } = await supabaseAdmin
            .from('checks')
            .select('status, checked_at, latency_ms')
            .eq('server_id', serverId)
            .order('checked_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const raw = check?.status ?? 'unknown';
          const status =
            raw === 'up' ? 'online' : raw === 'down' ? 'offline' : raw === 'degraded' ? 'degraded' : 'unknown';

          return jsonResponse(
            {
              ok: true,
              status: raw, // compatibilidade com o Stream Play atual
              state: status, // contrato novo, normalizado
              last_check: check?.checked_at ?? null,
              last_check_at: check?.checked_at ?? null,
              latency: check?.latency_ms ?? null,
              message:
                status === 'online'
                  ? 'Tudo funcionando normalmente'
                  : status === 'unknown'
                    ? 'Sem leitura recente do servidor'
                    : 'Identificamos instabilidades no servidor',
            },
            200,
            { 'Cache-Control': 'public, max-age=30' },
          );
        } catch (error) {
          safeLog('ANDROID STATUS', 'erro interno', { error: (error as Error).message });
          return apiError('internal_error');
        }
      },
    },
  },
});
