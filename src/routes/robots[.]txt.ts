import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const robots = `User-agent: *
Allow: /
Disallow: /app/
Disallow: /admin/
Disallow: /api/
Allow: /api/public/

Sitemap: https://streammonitor.site/sitemap.xml`;

        return new Response(robots, {
          headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      },
    },
  },
});
