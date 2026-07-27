import { createFileRoute } from "@tanstack/react-router";
import { PLANS, type PlanId } from "@/lib/payments";

// Mercado Pago webhook (IPN / Webhooks v2).
// URL: https://streammonitor.site/api/public/webhooks/mercadopago
// MP posts JSON like: { action: "payment.updated", data: { id: "123" }, type: "payment", ... }
// We refetch the payment from MP to avoid trusting the payload, then update DB.

async function processPayment(mpPaymentId: string) {
  const { fetchMpPayment, mapMpStatus } = await import("@/lib/mercadopago.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const mp = await fetchMpPayment(mpPaymentId);
  const status = mapMpStatus(mp.status);
  const externalRef = (mp as any).external_reference as string | undefined;

  // Find our payment row: prefer external_reference (our uuid), fallback to provider_payment_id
  let query = supabaseAdmin.from("payments").select("*").limit(1);
  if (externalRef) query = query.eq("id", externalRef);
  else query = query.eq("provider_payment_id", String(mp.id));
  const { data: rows } = await query;
  const row = rows?.[0];
  if (!row) {
    console.warn("[mp-webhook] payment row not found for", mpPaymentId, externalRef);
    return;
  }

  await supabaseAdmin
    .from("payments")
    .update({
      status,
      provider_payment_id: String(mp.id),
      paid_at: status === "approved" ? new Date().toISOString() : row.paid_at,
      raw_payload: mp as unknown as Record<string, unknown>,
    })
    .eq("id", row.id);

  if (status !== "approved") return;

  // Extend subscription
  const plan = PLANS.find((p) => p.id === (row.plan as PlanId));
  if (!plan) return;

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", row.user_id)
    .maybeSingle();

  const now = new Date();
  const base = sub && new Date(sub.expires_at) > now ? new Date(sub.expires_at) : now;
  const newExpires = new Date(base.getTime() + plan.durationDays * 24 * 60 * 60 * 1000).toISOString();

  if (sub) {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        plan: plan.id,
        status: "active",
        expires_at: newExpires,
        cancelled_at: null,
      })
      .eq("id", sub.id);
  } else {
    await supabaseAdmin.from("subscriptions").insert({
      user_id: row.user_id,
      plan: plan.id,
      status: "active",
      started_at: now.toISOString(),
      expires_at: newExpires,
    });
  }

  // Referral reward: give referrer +30 days on first approved payment
  const { data: ref } = await supabaseAdmin
    .from("referrals")
    .select("*")
    .eq("referred_id", row.user_id)
    .is("reward_granted_at", null)
    .maybeSingle();
  if (ref) {
    const { data: refSub } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", ref.referrer_id)
      .maybeSingle();
    if (refSub) {
      const rBase = new Date(refSub.expires_at) > now ? new Date(refSub.expires_at) : now;
      const rNew = new Date(rBase.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("subscriptions")
        .update({
          expires_at: rNew,
          status: refSub.status === "expired" || refSub.status === "cancelled" ? "active" : refSub.status,
        })
        .eq("id", refSub.id);
    }
    await supabaseAdmin
      .from("referrals")
      .update({ converted_at: new Date().toISOString(), reward_granted_at: new Date().toISOString() })
      .eq("id", ref.id);
  }
}

async function handle(request: Request) {
  const url = new URL(request.url);
  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }

  // Extract payment id from either query (?data.id=...&type=payment) or body
  const type = url.searchParams.get("type") || body?.type || body?.topic;
  const paymentId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    body?.data?.id ||
    body?.resource;

  if (type && String(type) !== "payment") {
    return new Response("ignored", { status: 200 });
  }
  if (!paymentId) return new Response("missing payment id", { status: 200 });

  try {
    await processPayment(String(paymentId));
    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("[mp-webhook] error:", e?.message ?? e);
    // Return 200 to prevent retry loops on unrecoverable errors; log for debugging.
    return new Response(`error: ${e?.message ?? "unknown"}`, { status: 200 });
  }
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
