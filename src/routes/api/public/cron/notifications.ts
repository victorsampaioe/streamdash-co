import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/cron/notifications')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const configured = process.env.CRON_SECRET;
        const submitted = request.headers.get('x-cron-secret') || url.searchParams.get('secret');
        if (!configured || !submitted || submitted !== configured) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const { flushNotificationQueue } = await import('@/lib/notifications.server');
          const result = await flushNotificationQueue();
          return Response.json({ ok: true, ...(result ?? {}) });
        } catch (error: any) {
          console.error('[cron/notifications] Falha', error);
          return Response.json({ ok: false, error: 'notification_flush_failed' }, { status: 503 });
        }
      }
    }
  }
});
