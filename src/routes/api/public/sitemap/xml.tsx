import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/sitemap/xml')({
  server: {
    handlers: {
      GET: async () => {
        const pages = [
          { url: '', priority: '1.0', changefreq: 'daily' },
          { url: '/monitoramento-iptv', priority: '0.8', changefreq: 'weekly' },
          { url: '/monitoramento-dns', priority: '0.8', changefreq: 'weekly' },
          { url: '/alertas-telegram', priority: '0.8', changefreq: 'weekly' },
          { url: '/revendedor-stream-monitor', priority: '0.8', changefreq: 'weekly' },
          { url: '/blog', priority: '0.7', changefreq: 'daily' },
          { url: '/blog/como-evitar-queda-iptv', priority: '0.7', changefreq: 'weekly' },
          { url: '/auth', priority: '0.5', changefreq: 'monthly' },
          { url: '/planos', priority: '0.8', changefreq: 'weekly' },
          { url: '/contato', priority: '0.5', changefreq: 'monthly' },
          { url: '/sobre', priority: '0.5', changefreq: 'monthly' },
        ];

        const lastmod = new Date().toISOString().split('T')[0];

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages.map(page => `
  <url>
    <loc>https://streammonitor.site${page.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('').trim()}
</urlset>`;

        return new Response(sitemap, {
          headers: {
            'Content-Type': 'application/xml',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      },
    },
  },
});
