import { createFileRoute } from '@tanstack/react-router';
import { flushIptvNotificationQueue } from '@/lib/iptv-notify.server';

export const Route = createFileRoute('/api/public/cron/iptv-notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get('Authorization');
        if (authHeader !== `Bearer ${process.env['CRON_SECRET']}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          await flushIptvNotificationQueue();
          return new Response(JSON.stringify({ success: true, processed_at: new Date().toISOString() }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          console.error('[Cron] IPTV Notifications Error:', error);
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
      }
    }
  }
});
