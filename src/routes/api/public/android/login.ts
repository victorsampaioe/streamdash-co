import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import {
  normalizeBase,
  resolveServerForCredentials,
  type ProbeTarget,
} from '@/lib/android-resolve.server';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Licença do revendedor: bloqueia apenas quando existe registro e está inativo/vencido. */
async function licenseBlocked(resellerId: string | null): Promise<string | null> {
  if (!resellerId) return null;
  const { data } = await supabaseAdmin.rpc('validate_android_play_access', {
    _reseller_id: resellerId,
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null; // sem licença cadastrada => não bloqueia
  if (row.is_active) return null;
  return 'Licença Stream Monitor Play inativa ou vencida para este provedor.';
}

export const Route = createFileRoute('/api/public/android/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = loginSchema.safeParse(body);
          if (!parsed.success) return json({ error: 'Informe usuário e senha.' }, 400);

          const username = parsed.data.username.trim();
          const password = parsed.data.password.trim();
          console.log(`[ANDROID LOGIN] tentativa user=${username}`);

          // 1) Associação já conhecida (login rápido)
          const { data: association } = await supabaseAdmin
            .from('android_client_associations')
            .select('reseller_id, server_id, servers:server_id(id, name, host, owner_id)')
            .eq('client_username', username)
            .eq('client_password', password)
            .maybeSingle();

          const known = (association?.servers ?? null) as ProbeTarget | null;
          if (known?.host) {
            const blocked = await licenseBlocked(association!.reseller_id ?? known.owner_id);
            if (blocked) return json({ error: blocked }, 403);

            await supabaseAdmin
              .from('android_client_associations')
              .update({ last_login_at: new Date().toISOString() })
              .eq('client_username', username)
              .eq('client_password', password);

            return json({
              status: 'success',
              resolved_by: 'association',
              server: { id: known.id, dns: normalizeBase(known.host), name: known.name },
              server_id: known.id,
              reseller_id: association!.reseller_id ?? known.owner_id,
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

          const targets: ProbeTarget[] = (servers ?? [])
            .filter((s) => !s.monitoring_paused && !!s.host)
            .map((s) => ({ id: s.id, name: s.name ?? '', host: s.host as string, owner_id: s.owner_id }));

          if (serversError) console.error('[ANDROID LOGIN] servers query', serversError);
          console.log(`[ANDROID LOGIN] candidatos=${targets.length}`);
          if (targets.length === 0) {
            return json({ error: 'Nenhum servidor autorizado disponível no momento.' }, 503);
          }

          const hit = await resolveServerForCredentials(targets, username, password);
          if (!hit) {
            return json(
              { error: 'Usuário ou senha não encontrados em nenhum servidor autorizado.' },
              401,
            );
          }

          const resellerId = hit.server.owner_id;
          const blocked = await licenseBlocked(resellerId);
          if (blocked) return json({ error: blocked }, 403);

          await supabaseAdmin.from('android_client_associations').insert({
            client_username: username,
            client_password: password,
            server_id: hit.server.id,
            reseller_id: resellerId,
            last_login_at: new Date().toISOString(),
          });

          return json({
            status: 'success',
            resolved_by: 'auto',
            server: { id: hit.server.id, dns: hit.base, name: hit.server.name },
            server_id: hit.server.id,
            reseller_id: resellerId,
          });
        } catch (error) {
          console.error('[ANDROID LOGIN ERROR]', error);
          return json({ error: 'Erro interno no servidor' }, 500);
        }
      },
    },
  },
});
