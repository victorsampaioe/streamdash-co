import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createSubResellerInternal } from "./referrals.server";

export type ReferralSummary = {
  total_referrals: number;
  in_trial: number;
  subscribed_count: number;
  available_cents: number;
  pending_cents: number;
  paid_cents: number;
};

export const getMyReferralSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_referral_summary", { _user_id: context.userId });
    if (error) throw new Error(error.message);
    return data as unknown as ReferralSummary;
  });

const pixSchema = z.object({
  pixType: z.enum(["cpf", "phone", "email", "random"]),
  pixKey: z.string().trim().min(3).max(200),
  pixName: z.string().trim().min(2).max(200),
});

export const requestPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => pixSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("request_payout", {
      _pix_type: data.pixType,
      _pix_key: data.pixKey,
      _pix_name: data.pixName,
    });
    if (error) throw new Error(error.message);

    // Notify admin via Telegram
    try {
      const { notifyAdmin } = await import("@/lib/admin-telegram.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: pr } = await supabaseAdmin
        .from("payout_requests")
        .select("amount_cents, pix_type, pix_key, pix_name")
        .eq("id", id as string)
        .maybeSingle();
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", context.userId)
        .maybeSingle();
      const brl = pr ? (pr.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-";
      await notifyAdmin(
        `💸 <b>Nova solicitação de PIX (indicações)</b>\nUsuário: ${prof?.full_name ?? "-"} — ${prof?.email ?? "-"}\nTelefone: ${prof?.phone ?? "-"}\nValor: ${brl}\nChave (${pr?.pix_type}): ${pr?.pix_key}\nNome: ${pr?.pix_name}\n\nAcesse o painel admin para aprovar.`,
      );
    } catch (e) { console.error("[referrals] notifyAdmin payout:", e); }

    return { id: id as string };
  });

// Admin: list all payout requests
export const adminListPayoutRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_payout_requests");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      user_id: string;
      user_email: string | null;
      user_name: string | null;
      user_phone: string | null;
      amount_cents: number;
      pix_type: string;
      pix_key: string;
      pix_name: string;
      status: "requested" | "approved" | "paid" | "rejected";
      admin_note: string | null;
      requested_at: string;
      approved_at: string | null;
      paid_at: string | null;
      rejected_at: string | null;
      referral_count: number;
    }>;
  });

async function notifyPayoutUser(userId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: channels } = await supabaseAdmin
    .from("alert_channels")
    .select("target")
    .eq("owner_id", userId)
    .eq("kind", "telegram")
    .eq("enabled", true);
  for (const ch of channels ?? []) {
    const raw = String(ch.target ?? "").trim();
    const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    if (!chatId) continue;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
    } catch { /* ignore */ }
  }
}

export const adminApprovePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_approve_payout", { _id: data.id });
    if (error) throw new Error(error.message);
    // Notify requester
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin.from("payout_requests").select("user_id, amount_cents").eq("id", data.id).maybeSingle();
    if (pr) {
      const brl = (pr.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await notifyPayoutUser(pr.user_id, `✅ <b>Seu PIX foi aprovado</b>\nValor: ${brl}\nEm breve enviaremos o pagamento.`);
    }
    return { ok: true };
  });

export const adminMarkPayoutPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_mark_payout_paid", { _id: data.id });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin.from("payout_requests").select("user_id, amount_cents").eq("id", data.id).maybeSingle();
    if (pr) {
      const brl = (pr.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await notifyPayoutUser(pr.user_id, `💰 <b>PIX enviado com sucesso!</b>\nValor: ${brl}\nConfira sua conta bancária.`);
    }
    return { ok: true };
  });

export const adminRejectPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), note: z.string().max(500).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_reject_payout", { _id: data.id, _note: data.note ?? undefined });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pr } = await supabaseAdmin.from("payout_requests").select("user_id").eq("id", data.id).maybeSingle();
    if (pr) {
      await notifyPayoutUser(pr.user_id, `⚠️ <b>Sua solicitação de PIX foi recusada</b>${data.note ? `\nMotivo: ${data.note}` : ""}\n\nO saldo foi devolvido e você pode solicitar novamente.`);
    }
    return { ok: true };
  });

export const createSubReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email(),
        fullName: z.string().min(3),
        phone: z.string().min(8),
        isReseller: z.boolean().optional().default(true),
        planId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { isReseller, planId, ...userData } = data;
    const result = await createSubResellerInternal(
      context.userId, 
      userData.email, 
      userData.fullName, 
      userData.phone, 
      isReseller
    );

    // If it's a client (not reseller) and a plan was specified, we could auto-activate it here if paid.
    // For now, it creates with 1 day trial as per original logic.
    
    return result;
  });
