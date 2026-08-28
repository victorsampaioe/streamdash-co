import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { normalizeBase } from '@/lib/android-resolve.server';
import {
  apiError,
  auditLog,
  clientIp,
  consumeNonce,
  enforceRateLimits,
  jsonResponse,
  maskIdentifier,
  safeLog,
} from '@/lib/api-security.server';
import { clientKeyOf, issueSession } from '@/lib/android-session.server';
import { isServerOfferedTo, licenseBlocked } from '@/lib/android-guard.server';

const schema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  server_id: z.string().uuid(),
  device_id: z.string().min(4).max(128).optional(),
  resolution_token: z.string().min(16).max(128).optional(),
  request_id: z.string().min(8).max(128).optional(),
});

const MAX_BODY = 8 * 1024;

/**
 * Registra a associação cliente -> servidor confirmada no dispositivo.
 * O backend NUNCA confia no server_id enviado: ele precisa ter sido ofertado
 * como candidato naquele login (resolution grant) e o servidor precisa existir,
 * estar ativo e ter dono válido.
 */
export const Route = createFileRoute('/api/public/android/associate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const raw = await request.text();
          if (raw.length > MAX_BODY) return apiError('invalid_payload');

          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            return apiError('invalid_payload');
          }

          const parsed = schema.safeParse(body);
          if (!parsed.success) return apiError('invalid_payload');
          const { username, password, server_id } = parsed.data;
          const deviceId = parsed.data.device_id ?? null;
          const ip = clientIp(request.headers);
          const clientKey = clientKeyOf(username);

          const limited = await enforceRateLimits([
            { rule: { bucket: 'android_assoc_ip', limit: 40, windowSeconds: 300 }, key: ip },
            { rule: { bucket: 'android_assoc_user', limit: 10, windowSeconds: 300 }, key: clientKey },
          ]);
          if (limited) return limited;

          // Anti-replay opcional (novo contrato): mesma operação não é reprocessada.
          if (parsed.data.request_id) {
            const fresh = await consumeNonce(parsed.data.request_id, 'android_associate');
            if (!fresh) return apiError('replay_detected');
          }

          // Autorização: o servidor precisa ter sido ofertado a este cliente.
          const offered = await isServerOfferedTo(clientKey, server_id, parsed.data.resolution_token);
          if (!offered) {
            await auditLog({
              action: 'android.associate.rejected',
              severity: 'warning',
              target: maskIdentifier(username),
              metadata: { server_id, reason: 'server_nao_ofertado' },
              ip,
            });
            return apiError('forbidden');
          }

          const { data: server } = await supabaseAdmin
            .from('servers')
            .select('id, name, host, owner_id, monitoring_paused')
            .eq('id', server_id)
            .maybeSingle();

          if (!server?.host) return apiError('not_found');

          const resellerId = server.owner_id;
          if (!resellerId) return apiError('forbidden');
          if (await licenseBlocked(resellerId)) return apiError('license_inactive');

          const { data: existing } = await supabaseAdmin
            .from('android_client_associations')
            .select('id')
            .eq('client_username', username)
            .eq('client_password', password)
            .maybeSingle();

          const payload = {
            client_username: username,
            client_password: password,
            server_id: server.id,
            reseller_id: resellerId,
            last_login_at: new Date().toISOString(),
          };

          if (existing?.id) {
            await supabaseAdmin.from('android_client_associations').update(payload).eq('id', existing.id);
          } else {
            await supabaseAdmin.from('android_client_associations').insert(payload);
          }

          const session = await issueSession({
            clientKey,
            resellerId,
            serverId: server.id,
            deviceId,
          });

          await auditLog({
            action: 'android.associate.ok',
            target: maskIdentifier(username),
            metadata: { server_id: server.id, reseller_id: resellerId },
            ip,
          });

          return jsonResponse({
            ok: true,
            status: 'success',
            resolved_by: 'client',
            server: { id: server.id, dns: normalizeBase(server.host), name: server.name },
            server_id: server.id,
            reseller_id: resellerId,
            session,
          });
        } catch (error) {
          safeLog('ANDROID ASSOCIATE', 'erro interno', { error: (error as Error).message });
          return apiError('internal_error');
        }
      },
    },
  },
});
