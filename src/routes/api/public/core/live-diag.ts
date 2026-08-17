/**
 * DIAGNÓSTICO TEMPORÁRIO — comparação entre servidores de TV ao vivo.
 * Retorna, por host, o último manifesto/segmento observado e um veredito
 * (manifesto, segmentos, headers ou bloqueio da origem).
 *
 * Protegido por x-cron-secret. Remover junto com src/lib/live-diagnostics.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { liveDiagSnapshot } from "@/lib/live-diagnostics";

export const Route = createFileRoute("/api/public/core/live-diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const provided =
          request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
        if (!secret || provided !== secret) {
          return new Response("Não autorizado", { status: 401 });
        }
        return new Response(JSON.stringify(liveDiagSnapshot(), null, 2), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
