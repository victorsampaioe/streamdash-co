import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const IP_SALT = "sm-signup-ip-v1";

export type SignupRejection =
  | "invalid_name"
  | "invalid_email"
  | "invalid_phone"
  | "invalid_password"
  | "invalid_referral"
  | "duplicate_email"
  | "duplicate_phone"
  | "duplicate_request"
  | "rate_limit_exceeded"
  | "temporarily_blocked"
  | "turnstile_rejected"
  | "honeypot_triggered"
  | "signup_failed";

export function log(step: string, detail?: unknown) {
  // Nunca registrar senha nem tokens
  console.log(`[SIGNUP SECURITY] ${step}`, detail ? JSON.stringify(detail) : "");
}

export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}${IP_SALT}`).digest("hex");
}

/** 177.***.***.42 — nunca guardamos o IP completo em claro. */
export function maskIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.***.***.${parts[3]}`;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts[0]}:***:***:${parts[parts.length - 1] || "0"}`;
  }
  return "***";
}

export function attemptFingerprint(email: string, phone: string, ipHash: string): string {
  const bucket = Math.floor(Date.now() / 60_000); // janela de 60s
  return createHash("sha256").update(`${email}|${phone}|${ipHash}|${bucket}`).digest("hex");
}

export async function isBlocked(ipHash: string): Promise<{ blocked: boolean; until?: string; reason?: string }> {
  const { data } = await supabaseAdmin
    .from("signup_blocks" as any)
    .select("blocked_until, reason")
    .eq("key", ipHash)
    .maybeSingle();
  const row = data as any;
  if (row?.blocked_until && new Date(row.blocked_until).getTime() > Date.now()) {
    return { blocked: true, until: row.blocked_until, reason: row.reason };
  }
  return { blocked: false };
}

export async function blockIp(ipHash: string, reason: string, attempts: number, hours = 6) {
  const until = new Date(Date.now() + hours * 3600_000).toISOString();
  await supabaseAdmin
    .from("signup_blocks" as any)
    .upsert({ key: ipHash, reason, attempts, blocked_until: until } as any, { onConflict: "key" });
  log("temporary block applied", { reason, attempts, until });
}

async function countAttempts(ipHash: string, minutes: number): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("signup_attempts" as any)
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .neq("reason", "rate_limit_exceeded")
    .gte("created_at", since);
  return count || 0;
}

/** 3 tentativas / 10 min · 5 tentativas / 1h · bloqueio temporário em burst. */
export async function checkRateLimit(ipHash: string): Promise<{ allowed: boolean; reason?: SignupRejection }> {
  const [last10, last60, last5] = await Promise.all([
    countAttempts(ipHash, 10),
    countAttempts(ipHash, 60),
    countAttempts(ipHash, 5),
  ]);

  if (last5 >= 10) {
    await blockIp(ipHash, "burst_detected", last5, 6);
    return { allowed: false, reason: "temporarily_blocked" };
  }
  if (last10 >= 3 || last60 >= 5) {
    return { allowed: false, reason: "rate_limit_exceeded" };
  }
  return { allowed: true };
}

export async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    log("turnstile not configured — skipping verification");
    return true;
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!json.success) log("turnstile rejected", { codes: json["error-codes"] });
    return !!json.success;
  } catch (e) {
    log("turnstile verification error", { message: (e as Error).message });
    return false;
  }
}

export interface AttemptRecord {
  ipHash: string;
  ipMasked: string;
  emailNorm?: string | null;
  phoneNorm?: string | null;
  fullName?: string | null;
  fingerprint?: string | null;
  userAgent?: string | null;
}

/** Cria o registro da tentativa. Retorna null quando o fingerprint já existe (POST duplicado). */
export async function openAttempt(rec: AttemptRecord): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("signup_attempts" as any)
    .insert({
      status: "processing",
      ip_hash: rec.ipHash,
      ip_masked: rec.ipMasked,
      email_norm: rec.emailNorm ?? null,
      phone_norm: rec.phoneNorm ?? null,
      full_name: rec.fullName ?? null,
      fingerprint: rec.fingerprint ?? null,
      user_agent: rec.userAgent?.slice(0, 300) ?? null,
    } as any)
    .select("id")
    .single();

  if (error) {
    if ((error as any).code === "23505" || /duplicate key/i.test(error.message)) return null;
    log("attempt log failed", { message: error.message });
    return "unlogged";
  }
  return (data as any).id as string;
}

export async function closeAttempt(
  id: string | null,
  status: "created" | "rejected",
  reason?: SignupRejection | null,
  userId?: string | null,
) {
  if (!id || id === "unlogged") return;
  await supabaseAdmin
    .from("signup_attempts" as any)
    .update({ status, reason: reason ?? null, user_id: userId ?? null } as any)
    .eq("id", id);
}

/** Garante um único alerta de "Novo cadastro" por usuário. */
export async function claimSignupNotification(userId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("alert_idempotency" as any)
    .insert({ id: `signup_notify_${userId}` } as any);
  return !error;
}
