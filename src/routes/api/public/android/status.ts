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
          .select('status, checked_at, latency_ms')
          .eq('server_id', serverId)
          .order('checked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return new Response(JSON.stringify({
          status: check?.status || 'unknown',
          last_check: check?.checked_at,
          latency: check?.latency_ms,
          message: check?.status === 'up' ? 'Tudo funcionando normalmente' : 'Identificamos instabilidades no servidor',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

      },
    },
  },
});
