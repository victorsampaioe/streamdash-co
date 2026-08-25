import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { normalizeBase } from '@/lib/android-resolve.server';

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  server_id: z.string().uuid(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Registra a associação cliente -> servidor quando a resolução foi confirmada
 * no dispositivo (IP residencial), garantindo login rápido nas próximas vezes.
 */
export const Route = createFileRoute('/api/public/android/associate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = schema.safeParse(await request.json());
          if (!parsed.success) return json({ error: 'Payload inválido.' }, 400);
          const { username, password, server_id } = parsed.data;

          const { data: server } = await supabaseAdmin
            .from('servers')
            .select('id, name, host, owner_id')
            .eq('id', server_id)
            .maybeSingle();

          if (!server?.host) return json({ error: 'Servidor não encontrado.' }, 404);

          const resellerId = server.owner_id;
          if (resellerId) {
            const { data } = await supabaseAdmin.rpc('validate_android_play_access', {
              _reseller_id: resellerId,
            });
            const row = Array.isArray(data) ? data[0] : null;
            if (row && !row.is_active) {
              return json(
                { error: 'Licença Stream Monitor Play inativa ou vencida para este provedor.' },
                403,
              );
            }
          }

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
            await supabaseAdmin
              .from('android_client_associations')
              .update(payload)
              .eq('id', existing.id);
          } else {
            await supabaseAdmin.from('android_client_associations').insert(payload);
          }

          return json({
            status: 'success',
            resolved_by: 'client',
            server: { id: server.id, dns: normalizeBase(server.host), name: server.name },
            server_id: server.id,
            reseller_id: resellerId,
          });
        } catch (error) {
          console.error('[ANDROID ASSOCIATE ERROR]', error);
          return json({ error: 'Erro interno no servidor' }, 500);
        }
      },
    },
  },
});
