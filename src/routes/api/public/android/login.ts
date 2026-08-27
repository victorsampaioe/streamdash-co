import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import {
  normalizeBase,
  resolveServerForCredentials,
  type ProbeTarget,
} from '@/lib/android-resolve.server';
import {
  apiError,
  clientIp,
  enforceRateLimits,
  jsonResponse,
  maskIdentifier,
  safeLog,
  auditLog,
} from '@/lib/api-security.server';
import { clientKeyOf, issueSession } from '@/lib/android-session.server';
import { createResolutionGrant, licenseBlocked } from '@/lib/android-guard.server';

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  device_id: z.string().min(4).max(128).optional(),
});

const MAX_BODY = 8 * 1024;

export const Route = createFileRoute('/api/public/android/login')({
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

          const parsed = loginSchema.safeParse(body);
          if (!parsed.success) return apiError('invalid_payload', 'Informe usuário e senha.');

          const username = parsed.data.username.trim();
          const password = parsed.data.password.trim();
          const deviceId = parsed.data.device_id ?? null;
          const ip = clientIp(request.headers);
          const clientKey = clientKeyOf(username);

          // Rate limit: IP (NAT tolerante), dispositivo e usuário (hash).
          const limited = await enforceRateLimits([
            { rule: { bucket: 'android_login_ip', limit: 60, windowSeconds: 300 }, key: ip },
            ...(deviceId
              ? [{ rule: { bucket: 'android_login_device', limit: 12, windowSeconds: 300 }, key: deviceId }]
              : []),
            { rule: { bucket: 'android_login_user', limit: 8, windowSeconds: 300 }, key: clientKey },
            { rule: { bucket: 'android_login_user_h', limit: 30, windowSeconds: 3600 }, key: clientKey },
          ]);
          if (limited) {
            await auditLog({
              action: 'android.login.rate_limited',
              severity: 'warning',
              target: maskIdentifier(username),
              ip,
            });
            return limited;
          }

          safeLog('ANDROID LOGIN', 'tentativa', { user: maskIdentifier(username) });

          // 1) Associação já conhecida (login rápido)
          const { data: association } = await supabaseAdmin
            .from('android_client_associations')
            .select('reseller_id, server_id, servers:server_id(id, name, host, owner_id)')
            .eq('client_username', username)
            .eq('client_password', password)
            .maybeSingle();

          const known = (association?.servers ?? null) as ProbeTarget | null;
          if (known?.host) {
            const resellerId = association!.reseller_id ?? known.owner_id;
            if (await licenseBlocked(resellerId)) return apiError('license_inactive');

            await supabaseAdmin
              .from('android_client_associations')
              .update({ last_login_at: new Date().toISOString() })
              .eq('client_username', username)
              .eq('client_password', password);

            const session = await issueSession({
              clientKey,
              resellerId,
              serverId: known.id,
              deviceId,
            });

            return jsonResponse({
              ok: true,
              status: 'success',
              resolved_by: 'association',
              server: { id: known.id, dns: normalizeBase(known.host), name: known.name },
              server_id: known.id,
              reseller_id: resellerId,
              session,
            });
          }

          // 2) Resolução automática: testa as credenciais nos servidores monitorados
          const { data: servers, error: serversError } = await supabaseAdmin
            .from('servers')
            .select('id, name, host, owner_id, monitoring_paused, iptv_username, last_checked_at')
            .not('host', 'is', null)
            .not('iptv_username', 'is', null)
            .order('last_checked_at', { ascending: false })
            .limit(60);

          if (serversError) safeLog('ANDROID LOGIN', 'falha ao listar servidores');

          const targets: ProbeTarget[] = (servers ?? [])
            .filter((s) => !s.monitoring_paused && !!s.host)
            .map((s) => ({ id: s.id, name: s.name ?? '', host: s.host as string, owner_id: s.owner_id }));

          if (targets.length === 0) return apiError('unavailable');

          const hit = await resolveServerForCredentials(targets, username, password);

          if (!hit) {
            // Muitos painéis bloqueiam IP de datacenter: o app valida localmente.
            const candidates = targets.slice(0, 25);
            const grant = await createResolutionGrant(
              clientKey,
              candidates.map((c) => c.id),
            );
            return jsonResponse({
              ok: true,
              status: 'resolve_client',
              resolution_token: grant?.token ?? null,
              resolution_expires_at: grant?.expires_at ?? null,
              // contrato estável: sempre array de objetos { id, name, dns }
              candidates: candidates.map((t) => ({
                id: t.id,
                name: t.name ?? '',
                dns: normalizeBase(t.host),
              })),
            });
          }

          const resellerId = hit.server.owner_id;
          if (await licenseBlocked(resellerId)) return apiError('license_inactive');

          if (resellerId) {
            await supabaseAdmin.from('android_client_associations').insert({
              client_username: username,
              client_password: password,
              server_id: hit.server.id,
              reseller_id: resellerId,
              last_login_at: new Date().toISOString(),
            });
          }

          const session = await issueSession({
            clientKey,
            resellerId,
            serverId: hit.server.id,
            deviceId,
          });

          await auditLog({
            action: 'android.login.auto_resolved',
            target: maskIdentifier(username),
            metadata: { server_id: hit.server.id },
            ip,
          });

          return jsonResponse({
            ok: true,
            status: 'success',
            resolved_by: 'auto',
            server: { id: hit.server.id, dns: hit.base, name: hit.server.name },
            server_id: hit.server.id,
            reseller_id: resellerId,
            session,
          });
        } catch (error) {
          safeLog('ANDROID LOGIN', 'erro interno', { error: (error as Error).message });
          return apiError('internal_error');
        }
      },
    },
  },
});
