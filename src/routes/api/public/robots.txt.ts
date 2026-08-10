import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/robots/txt')({
  server: {
    handlers: {
      GET: async () => {
        const robots = `User-agent: *
Allow: /
Sitemap: https://streammonitor.site/api/public/sitemap`;

        return new Response(robots, {
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      },
    },
  },
});
