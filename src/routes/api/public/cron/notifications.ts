import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/cron/notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get('secret');
        
        if (secret !== process.env.CRON_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const { flushNotificationQueue } = await import('@/lib/notifications.server');
          await flushNotificationQueue();
          return new Response('Notifications processed');
        } catch (error: any) {
          return new Response(`Error: ${error.message}`, { status: 500 });
        }
      }
    }
  }
});
