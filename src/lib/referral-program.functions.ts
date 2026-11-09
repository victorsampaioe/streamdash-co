import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Painel particular de indicações. Valores sempre vêm do ledger no banco,
 * nunca de um valor editável pelo navegador.
 */
export const getReferralDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const userId = context.userId;

    const [profileResult, walletResult, referralsResult, commissionsResult, redemptionsResult] = await Promise.all([
      db.from("profiles").select("referral_code").eq("id", userId).single(),
      db.rpc("referral_wallet_balance", { _owner: userId }),
      db.from("referrals").select("referred_id,status,created_at,subscribed_at").eq("referrer_id", userId).order("created_at", { ascending: false }).limit(200),
      db.from("referral_commissions").select("referred_id,paid_amount_cents,amount_cents,created_at,reversed_at").eq("referrer_id", userId).order("created_at", { ascending: false }).limit(200),
      db.from("referral_credit_redemptions").select("payment_id,amount_cents,created_at").eq("owner_id", userId).order("created_at", { ascending: false }).limit(200),
    ]);
    for (const r of [profileResult, walletResult, referralsResult, commissionsResult, redemptionsResult]) {
      if (r.error) throw new Error("Não foi possível carregar o programa de indicações.");
    }

    const referrals = referralsResult.data ?? [];
    const commissions = commissionsResult.data ?? [];
    const wallet = walletResult.data?.[0];
    const earningsByUser = new Map<string, number>();
    for (const c of commissions) {
      if (c.reversed_at) continue;
      earningsByUser.set(c.referred_id, (earningsByUser.get(c.referred_id) ?? 0) + c.amount_cents);
    }
    return {
      referralCode: profileResult.data?.referral_code ?? "",
      totalIndicated: referrals.length,
      convertedIndicated: referrals.filter((r: any) => ["subscribed", "requested", "approved", "paid"].includes(r.status)).length,
      wallet: {
        earnedCents: Number(wallet?.earned_cents ?? 0),
        availableCents: Number(wallet?.available_cents ?? 0),
        usedCents: Number(wallet?.used_cents ?? 0),
        reservedCents: Number(wallet?.reserved_cents ?? 0),
      },
      referrals: referrals.slice(0, 50).map((r: any, index: number) => ({
        label: `Indicação #${referrals.length - index}`,
        joinedAt: r.created_at,
        active: ["subscribed", "requested", "approved", "paid"].includes(r.status),
        earnedCents: earningsByUser.get(r.referred_id) ?? 0,
      })),
      recentRewards: commissions.filter((c: any) => !c.reversed_at).slice(0, 10).map((c: any) => ({
        paidAmountCents: c.paid_amount_cents,
        rewardCents: c.amount_cents,
        createdAt: c.created_at,
      })),
      redemptionsCount: redemptionsResult.data?.length ?? 0,
    };
  });
