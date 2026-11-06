import { createFileRoute } from "@tanstack/react-router";

/** Fixed, authenticated, one-time communication. No arbitrary message input. */
export const Route = createFileRoute("/api/public/cron/service-update-2026")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const configured = process.env.CRON_SECRET;
        if (!configured || request.headers.get("authorization") !== `Bearer ${configured}`) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        try {
          const { withCycleLock } = await import("@/lib/job-lock.server");
          const { sendServiceUpdateCampaign } = await import("@/lib/service-update-campaign.server");
          const result = await withCycleLock(
            "telegram-service-update-2026", 180, () => sendServiceUpdateCampaign(),
          );
          return Response.json({ ok: true, ...result }, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          console.error("[service-update-campaign] Error", error instanceof Error ? error.name : "unknown");
          return Response.json({ ok: false, error: "service_update_failed" }, { status: 503 });
        }
      },
    },
  },
});
