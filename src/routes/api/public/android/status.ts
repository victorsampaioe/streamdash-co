import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/android/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const serverId = url.searchParams.get('server_id');

        if (!serverId) return new Response('Missing server_id', { status: 400 });

        // Buscar status real do monitoramento (integrado com Uptime Kuma/Checks)
        const { data: check } = await supabaseAdmin
          .from('checks')
          .select('status, last_ping, latency')
          .eq('server_id', serverId)
          .single();

        return new Response(JSON.stringify({
          status: check?.status || 'unknown',
          last_check: check?.last_ping,
          latency: check?.latency,
          message: check?.status === 'up' ? 'Tudo funcionando normalmente' : 'Identificamos instabilidades no servidor',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
  },
});
