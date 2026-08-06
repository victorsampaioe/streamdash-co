import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_MAP = {
  trial: { days: 1, credits: 0, plan: "trial", status: "trial", label: "Teste 1 dia" },
  monthly: { days: 30, credits: 1, plan: "monthly", status: "active", label: "Mensal" },
  quarterly: { days: 90, credits: 3, plan: "quarterly", status: "active", label: "Trimestral" },
  semiannual: { days: 180, credits: 6, plan: "semiannual", status: "active", label: "Semestral" },
  annual: { days: 365, credits: 12, plan: "yearly", status: "active", label: "Anual" },
} as const;

type PlanKey = keyof typeof PLAN_MAP;

async function assertOwnership(supabase: any, admin: any, ownerId: string, targetId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: ownerId, _role: "admin" });
  if (isAdmin) return { isAdmin: true };

  const [{ data: tree }, { data: profile }] = await Promise.all([
    admin.from("reseller_tree").select("parent_reseller_id").eq("user_id", targetId).maybeSingle(),
    admin.from("profiles").select("parent_id").eq("id", targetId).maybeSingle(),
  ]);
  const owned = tree?.parent_reseller_id === ownerId || profile?.parent_id === ownerId;
  if (!owned) throw new Error("Acesso negado: esta conta não pertence à sua rede.");
  return { isAdmin: false };
}

/** All accounts created by the caller (clients + sub-resellers), with plan/validity/credits. */
export const listMyAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: tree }, { data: byParent }] = await Promise.all([
      supabaseAdmin.from("reseller_tree").select("user_id").eq("parent_reseller_id", userId),
      supabaseAdmin.from("profiles").select("id").eq("parent_id", userId),
    ]);

    const ids = Array.from(
      new Set([...(tree ?? []).map((t: any) => t.user_id), ...(byParent ?? []).map((p: any) => p.id)])
    ).filter((id) => id && id !== userId);

    if (ids.length === 0) return [];

    const [{ data: profiles }, { data: subs }, { data: wallets }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, created_at, is_reseller, phone, whatsapp").in("id", ids),
      supabaseAdmin.from("subscriptions").select("user_id, plan, status, expires_at").in("user_id", ids),
      supabaseAdmin.from("reseller_wallet").select("reseller_id, credits").in("reseller_id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);

    // keep supabase (RLS client) referenced so the auth context stays meaningful
    void supabase;

    const subMap = new Map((subs ?? []).map((s: any) => [s.user_id, s]));
    const walletMap = new Map((wallets ?? []).map((w: any) => [w.reseller_id, w.credits ?? 0]));
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = roleMap.get((r as any).user_id) ?? [];
      list.push((r as any).role);
      roleMap.set((r as any).user_id, list);
    }

    const now = Date.now();
    return (profiles ?? []).map((p: any) => {
      const sub: any = subMap.get(p.id) ?? null;
      const expires = sub?.expires_at ? new Date(sub.expires_at).getTime() : null;
      const userRoles = roleMap.get(p.id) ?? [];
      const accountType = p.is_reseller
        ? userRoles.includes("reseller")
          ? "reseller"
          : "sub_reseller"
        : "client";

      let status: "trial" | "active" | "expired" = "expired";
      if (p.is_reseller) {
        status = (walletMap.get(p.id) ?? 0) > 0 ? "active" : "expired";
      } else if (expires && expires > now) {
        status = sub?.status === "trial" || sub?.plan === "trial" ? "trial" : "active";
      }

      return {
        id: p.id,
        fullName: p.full_name as string | null,
        email: p.email as string | null,
        createdAt: p.created_at as string,
        phone: (p.whatsapp || p.phone) as string | null,
        accountType,
        isReseller: !!p.is_reseller,
        plan: (sub?.plan ?? null) as string | null,
        expiresAt: (sub?.expires_at ?? null) as string | null,
        credits: walletMap.get(p.id) ?? 0,
        status,
      };
    }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });

/** Edit an account owned by the caller. */
export const updateMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().min(2).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
        plan: z.enum(["trial", "monthly", "quarterly", "semiannual", "yearly", "reseller"]).optional(),
        expiresAt: z.string().optional(),
        status: z.enum(["trial", "active", "expired", "cancelled"]).optional(),
        creditsDelta: z.number().int().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isAdmin } = await assertOwnership(supabase, supabaseAdmin, userId, data.userId);

    const profilePatch: Record<string, unknown> = {};
    if (data.fullName) profilePatch.full_name = data.fullName;
    if (data.email) profilePatch.email = data.email;
    if (Object.keys(profilePatch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profilePatch as any).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    const authPatch: Record<string, unknown> = {};
    if (data.email) authPatch.email = data.email;
    if (data.password) authPatch.password = data.password;
    if (Object.keys(authPatch).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authPatch as any);
      if (error) throw new Error(error.message);
    }

    const subPatch: Record<string, unknown> = {};
    if (data.plan) subPatch.plan = data.plan;
    if (data.status) subPatch.status = data.status;
    if (data.expiresAt) subPatch.expires_at = new Date(data.expiresAt).toISOString();
    if (Object.keys(subPatch).length) {
      const { data: existing } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (existing) {
        const { error } = await supabaseAdmin.from("subscriptions").update(subPatch as any).eq("user_id", data.userId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from("subscriptions").insert({
          user_id: data.userId,
          plan: (subPatch.plan as string) ?? "monthly",
          status: (subPatch.status as string) ?? "active",
          started_at: new Date().toISOString(),
          expires_at: (subPatch.expires_at as string) ?? new Date(Date.now() + 30 * 864e5).toISOString(),
        } as any);
        if (error) throw new Error(error.message);
      }
    }

    if (data.creditsDelta && data.creditsDelta !== 0) {
      const [{ data: target }, { data: mine }] = await Promise.all([
        supabaseAdmin.from("reseller_wallet").select("credits").eq("reseller_id", data.userId).maybeSingle(),
        supabaseAdmin.from("reseller_wallet").select("credits").eq("reseller_id", userId).maybeSingle(),
      ]);
      const targetCredits = target?.credits ?? 0;
      const myCredits = mine?.credits ?? 0;
      const next = targetCredits + data.creditsDelta;
      if (next < 0) throw new Error("O saldo do revendedor não pode ficar negativo.");
      if (!isAdmin && data.creditsDelta > 0 && myCredits < data.creditsDelta) {
        throw new Error(`Saldo insuficiente. Você tem ${myCredits} crédito(s).`);
      }

      await supabaseAdmin
        .from("reseller_wallet")
        .upsert({ reseller_id: data.userId, credits: next, updated_at: new Date().toISOString() } as any, {
          onConflict: "reseller_id",
        });

      if (!isAdmin) {
        await supabaseAdmin
          .from("reseller_wallet")
          .update({ credits: myCredits - data.creditsDelta, updated_at: new Date().toISOString() } as any)
          .eq("reseller_id", userId);
      }

      await supabaseAdmin.from("reseller_credit_history").insert([
        {
          user_id: userId,
          amount: -data.creditsDelta,
          type: "adjustment",
          description: `Ajuste de créditos na rede (${data.creditsDelta > 0 ? "+" : ""}${data.creditsDelta})`,
        },
        {
          user_id: data.userId,
          amount: data.creditsDelta,
          type: "adjustment",
          description: "Ajuste de créditos pelo gestor",
        },
      ] as any);
    }

    return { success: true };
  });

/** Activate / renew a client subscription, charging the caller's wallet. */
export const activateMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        plan: z.enum(["trial", "monthly", "quarterly", "semiannual", "annual"]),
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isAdmin } = await assertOwnership(supabase, supabaseAdmin, userId, data.userId);

    const cfg = PLAN_MAP[data.plan as PlanKey];
    const cost = isAdmin ? 0 : cfg.credits;

    const { data: wallet } = await supabaseAdmin
      .from("reseller_wallet")
      .select("credits")
      .eq("reseller_id", userId)
      .maybeSingle();
    const balance = wallet?.credits ?? 0;
    if (cost > 0 && balance < cost) {
      throw new Error(`Saldo insuficiente. ${cfg.label} custa ${cost} crédito(s) e você tem ${balance}.`);
    }

    const { data: current } = await supabaseAdmin
      .from("subscriptions")
      .select("expires_at")
      .eq("user_id", data.userId)
      .maybeSingle();

    const base = current?.expires_at && new Date(current.expires_at).getTime() > Date.now()
      ? new Date(current.expires_at).getTime()
      : Date.now();
    const expires = new Date(base + cfg.days * 864e5).toISOString();

    const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: data.userId,
        plan: cfg.plan,
        status: cfg.status,
        started_at: new Date().toISOString(),
        expires_at: expires,
      } as any,
      { onConflict: "user_id" }
    );
    if (subError) throw new Error(subError.message);

    if (cost > 0) {
      await supabaseAdmin
        .from("reseller_wallet")
        .update({ credits: balance - cost, updated_at: new Date().toISOString() } as any)
        .eq("reseller_id", userId);
      await supabaseAdmin.from("reseller_credit_history").insert({
        user_id: userId,
        amount: -cost,
        type: "client_activation",
        description: `Ativou assinatura ${cfg.label} (${cfg.days} dias) de um cliente da rede`,
      } as any);
    }

    return { success: true, expiresAt: expires, plan: cfg.label, creditsUsed: cost };
  });
