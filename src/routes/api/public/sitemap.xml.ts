import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/sitemap/xml')({
  server: {
    handlers: {
      GET: async () => {
        const pages = [
          '',
          '/monitoramento-iptv',
          '/monitoramento-dns',
          '/alertas-telegram',
          '/revendedor-stream-monitor',
          '/blog',
          '/auth',
        ];

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages.map(page => `
  <url>
    <loc>https://streammonitor.site${page}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('')}
</urlset>`;

        return new Response(sitemap, {
          headers: {
            'Content-Type': 'application/xml',
          },
        });
      },
    },
  },
});
