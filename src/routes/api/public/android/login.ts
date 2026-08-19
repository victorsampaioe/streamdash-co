import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const Route = createFileRoute('/api/public/android/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { username, password } = loginSchema.parse(body);

          console.log(`[ANDROID LOGIN] Attempt for user: ${username}`);

          // 1. Verificar associação prévia (Login rápido)
          const { data: association, error: assocError } = await supabaseAdmin
            .from('android_client_associations')
            .select('*, servers:server_id(*)')
            .eq('client_username', username)
            .eq('client_password', password)
            .maybeSingle();

          if (assocError) throw assocError;

          if (association && association.servers) {
            const server = association.servers as any;

            // Verificar licença do revendedor
            const { data: license } = await supabaseAdmin
              .rpc('validate_android_play_access', { _reseller_id: association.reseller_id });

            if (!license || !license[0]?.is_active) {
              return new Response(JSON.stringify({ 
                error: 'Licença Stream Monitor Play inativa ou vencida para este provedor.' 
              }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            return new Response(JSON.stringify({
              status: 'success',
              server: {
                dns: server.dns,
                name: server.name,
              },
              reseller_id: association.reseller_id,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }


          // 2. Resolução Automática (Primeiro login ou falha na associação)
          // Aqui buscaríamos todos os servidores ativos e testaríamos o login (Simulado por enquanto)
          // Para um ecossistema real, o app enviaria o ecossistema ou testaríamos os 10 mais prováveis.
          
          return new Response(JSON.stringify({ 
            error: 'Usuário ou senha não encontrados em nenhum servidor autorizado.' 
          }), { status: 401, headers: { 'Content-Type': 'application/json' } });

        } catch (error) {
          console.error('[ANDROID LOGIN ERROR]', error);
          return new Response(JSON.stringify({ error: 'Erro interno no servidor' }), { status: 500 });
        }
      },
    },
  },
});
