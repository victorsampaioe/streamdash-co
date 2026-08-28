import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { apiError, clientIp, enforceRateLimits, jsonResponse, safeLog } from '@/lib/api-security.server';
import { refreshSession } from '@/lib/android-session.server';

const schema = z.object({ refresh_token: z.string().min(32).max(256) });

/** Renovação da sessão do Stream Play (rotação: o refresh anterior é revogado). */
export const Route = createFileRoute('/api/public/android/refresh')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > 4096) return apiError('invalid_payload');
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            return apiError('invalid_payload');
          }
          const parsed = schema.safeParse(body);
          if (!parsed.success) return apiError('invalid_payload');

          const limited = await enforceRateLimits([
            { rule: { bucket: 'android_refresh_ip', limit: 60, windowSeconds: 300 }, key: clientIp(request.headers) },
          ]);
          if (limited) return limited;

          const session = await refreshSession(parsed.data.refresh_token);
          if (!session) return apiError('unauthorized');

          return jsonResponse({ ok: true, session });
        } catch (error) {
          safeLog('ANDROID REFRESH', 'erro interno', { error: (error as Error).message });
          return apiError('internal_error');
        }
      },
    },
  },
});
