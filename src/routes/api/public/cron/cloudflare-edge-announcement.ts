import { createFileRoute } from "@tanstack/react-router";

/** Fixed, authenticated, one-time communication. No arbitrary message input. */
export const Route = createFileRoute("/api/public/cron/cloudflare-edge-announcement")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const configured = process.env.CRON_SECRET;
        if (!configured || request.headers.get("authorization") !== `Bearer ${configured}`) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const { withCycleLock } = await import("@/lib/job-lock.server");
          const { sendCloudflareEdgeAnnouncement } = await import("@/lib/cloudflare-edge-announcement.server");
          const result = await withCycleLock(
            "telegram-cloudflare-edge-2026", 180, () => sendCloudflareEdgeAnnouncement(),
          );
          return Response.json({ ok: true, ...result }, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          console.error("[cloudflare-edge-announcement] Error", error instanceof Error ? error.name : "unknown");
          return Response.json({ ok: false, error: "cloudflare_announcement_failed" }, { status: 503 });
        }
      },
    },
  },
});
