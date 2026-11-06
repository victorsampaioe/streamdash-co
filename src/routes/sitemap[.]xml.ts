import { createFileRoute } from "@tanstack/react-router";

/**
 * Sitemap com páginas públicas que existem no projeto.
 * Não anunciar URLs inexistentes, nem datas de atualização inventadas.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const paths = [
          "/",
          "/monitoramento-iptv",
          "/monitoramento-dns",
          "/alertas-telegram",
          "/revendedor-stream-monitor",
          "/blog",
          "/blog/como-evitar-queda-iptv",
          "/blog/como-saber-se-servidor-iptv-caiu",
          "/blog/dns-iptv-nao-resolve",
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(path => `  <url>
    <loc>https://streammonitor.site${path}</loc>
  </url>`).join("\n")}
</urlset>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
