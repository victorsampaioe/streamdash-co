import { createFileRoute } from "@tanstack/react-router";

/**
 * Two explicitly approved showcase images from existing Vitrine exports.
 * Files remain private in storage; only these two paths are publicly served.
 */
const EXAMPLES: Record<string, string> = {
  "codigo-vinganca": "ce0adb32-7f35-42cb-9605-539d0ef2e2dd/3ef9aed9-499e-4112-b37f-bbc27e713980.png",
  "como-magica": "ce0adb32-7f35-42cb-9605-539d0ef2e2dd/36a2e550-c149-4883-b318-bb34f1f63c90.png",
};

export const Route = createFileRoute("/api/public/vitrine-exemplos/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const storagePath = EXAMPLES[params.slug];
        if (!storagePath) return new Response("Imagem não encontrada.", { status: 404 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage.from("promo-arts").download(storagePath);
          if (error || !data) return new Response("Imagem indisponível.", { status: 404 });
          return new Response(await data.arrayBuffer(), {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=3600, s-maxage=86400",
              "X-Content-Type-Options": "nosniff",
              "Content-Disposition": "inline",
            },
          });
        } catch {
          return new Response("Falha ao carregar o exemplo.", { status: 503 });
        }
      },
    },
  },
});
