import { createFileRoute } from '@tanstack/react-router';
import { flushIptvNotificationQueue } from '@/lib/iptv-notify.server';

export const Route = createFileRoute('/api/public/cron/iptv-notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get('Authorization');
        const configured = process.env.CRON_SECRET;
        if (!configured || authHeader !== `Bearer ${configured}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const result = await flushIptvNotificationQueue();
          return new Response(JSON.stringify({ success: true, ...result, processed_at: new Date().toISOString() }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error: any) {
          console.error('[Cron] IPTV Notifications Error:', error);
          return new Response(JSON.stringify({ error: 'iptv_notification_flush_failed' }), { status: 503 });
        }
      }
    }
  }
});
