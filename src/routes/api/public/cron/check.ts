import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("x-cron-secret") ?? "";
        if (apikey !== process.env.CRON_SECRET) {
          return new Response("Forbidden", { status: 403 });
        }
        const { runDueChecks } = await import("@/lib/monitoring.server");
        try {
          const result = await runDueChecks();
          return Response.json(result);
        } catch (e: any) {
          return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 });
        }
      },
      GET: async ({ request }) => {
        const apikey = new URL(request.url).searchParams.get("secret") ?? "";
        if (apikey !== process.env.CRON_SECRET) return new Response("Forbidden", { status: 403 });
        const { runDueChecks } = await import("@/lib/monitoring.server");
        const result = await runDueChecks();
        return Response.json(result);
      },
    },
  },
});
