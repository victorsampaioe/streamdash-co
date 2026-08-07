import { createFileRoute } from "@tanstack/react-router";

/** Healthcheck público (usado pelo Docker e pelo Caddy). Não expõe dados. */
export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { status: "ok", service: "stream-monitor-core", time: new Date().toISOString() },
          { headers: { "cache-control": "no-store" } },
        ),
    },
  },
});
