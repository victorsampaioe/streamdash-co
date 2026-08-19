import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/android/config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const resellerId = url.searchParams.get('reseller_id');

        if (!resellerId) return new Response('Missing reseller_id', { status: 400 });

        const { data: config } = await supabaseAdmin
          .from('reseller_app_config')
          .select('*')
          .eq('reseller_id', resellerId)
          .single();

        return new Response(JSON.stringify({
          app_name: config?.app_name || 'Stream Monitor Play',
          logo_url: config?.logo_url,
          primary_color: config?.primary_color || '#3B82F6',
          footer_text: 'Powered by Stream Monitor',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
  },
});
