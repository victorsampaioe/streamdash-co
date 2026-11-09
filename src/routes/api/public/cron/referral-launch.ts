import { createFileRoute } from "@tanstack/react-router";

/** Campanha institucional: somente itens do Indique e Ganhe, sem tocar em incidentes. */
export const Route = createFileRoute("/api/public/cron/referral-launch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("x-cron-secret") !== secret) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        if (process.env.IS_CORE === "true") {
          return Response.json({ ok: true, skipped: true });
        }
        try {
          const { withCycleLock } = await import("@/lib/job-lock.server");
          const { flushReferralLaunchCampaign } = await import("@/lib/notifications.server");
          const result = await withCycleLock("cron-referral-launch", 110, () => flushReferralLaunchCampaign(8));
          return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          console.error("[cron/referral-launch] delivery failed", error instanceof Error ? error.name : "unknown");
          return Response.json({ ok: false, error: "delivery_failed" }, { status: 503 });
        }
      },
    },
  },
});
