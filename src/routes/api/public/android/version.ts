import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { apiError, clientIp, enforceRateLimits, jsonResponse, safeLog } from '@/lib/api-security.server';
import { isSafeHttpsUrl } from '@/lib/ssrf-guard';

/**
 * Versão publicada do Stream Play. Somente HTTPS e SHA-256 calculado no backend.
 * Endpoint complementar: se falhar, o app deve seguir com o último cache válido.
 */
export const Route = createFileRoute('/api/public/android/version')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const limited = await enforceRateLimits([
            { rule: { bucket: 'android_version_ip', limit: 120, windowSeconds: 300 }, key: clientIp(request.headers) },
          ]);
          if (limited) return limited;

          const { data: release } = await supabaseAdmin
            .from('app_releases')
            .select(
              'version_code, version_name, minimum_version_code, recommended_version_code, mandatory, message, update_url, sha256, file_size, signing_fingerprint, published_at',
            )
            .eq('status', 'published')
            .order('version_code', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!release || !isSafeHttpsUrl(release.update_url)) {
            return jsonResponse({ ok: true, release: null }, 200, { 'Cache-Control': 'public, max-age=120' });
          }

          return jsonResponse(
            {
              ok: true,
              release: {
                version_code: release.version_code,
                version_name: release.version_name,
                minimum_version_code: release.minimum_version_code,
                recommended_version_code: release.recommended_version_code ?? release.version_code,
                mandatory: release.mandatory,
                message: release.message ?? null,
                update_url: release.update_url,
                sha256: release.sha256,
                file_size: release.file_size,
                signing_fingerprint: release.signing_fingerprint ?? null,
                published_at: release.published_at,
              },
            },
            200,
            { 'Cache-Control': 'public, max-age=120' },
          );
        } catch (error) {
          safeLog('ANDROID VERSION', 'erro interno', { error: (error as Error).message });
          return apiError('internal_error');
        }
      },
    },
  },
});
