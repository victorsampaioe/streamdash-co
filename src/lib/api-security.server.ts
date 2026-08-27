/**
 * Server-only: primitivas de segurança compartilhadas pelas APIs públicas
 * (rate limit, anti-replay, auditoria, sanitização de log e envelope de erro).
 *
 * Regras:
 * - nunca registrar senha, token completo, Authorization, CRON_SECRET ou URL com credenciais;
 * - identificadores de usuário são sempre convertidos em hash antes de persistir;
 * - respostas ao cliente nunca contêm detalhe interno de infraestrutura.
 */

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const KEY_SALT = "stream-monitor-api-v1";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash estável (não reversível) usado como chave de rate limit / identificação. */
export function hashKey(value: string): string {
  return sha256(`${value}|${KEY_SALT}`);
}

export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export function maskIdentifier(value: string | null | undefined): string {
  if (!value) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}#${sha256(value).slice(0, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Sanitização de log                                                  */
/* ------------------------------------------------------------------ */

const SENSITIVE_KEYS =
  /^(password|senha|pass|token|access_token|refresh_token|authorization|apikey|api_key|secret|service_role|cron_secret|bearer)$/i;

/** Remove credenciais de qualquer valor antes de ir para o log. */
export function sanitizeForLog(input: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (input == null) return input;
  if (typeof input === "string") {
    return input
      .replace(/(password|senha|pass|token|apikey|api_key|secret)=([^&\s]+)/gi, "$1=***")
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***")
      .replace(/\/\/[^/@\s]+:[^@\s]+@/g, "//***:***@")
      .slice(0, 500);
  }
  if (typeof input !== "object") return input;
  if (Array.isArray(input)) return input.slice(0, 20).map((v) => sanitizeForLog(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? "***" : sanitizeForLog(v, depth + 1);
  }
  return out;
}

export function safeLog(scope: string, message: string, detail?: unknown) {
  if (detail === undefined) console.log(`[${scope}] ${message}`);
  else console.log(`[${scope}] ${message}`, JSON.stringify(sanitizeForLog(detail)));
}

/* ------------------------------------------------------------------ */
/* Envelope de resposta                                                */
/* ------------------------------------------------------------------ */

export type ApiErrorCode =
  | "invalid_payload"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "replay_detected"
  | "license_inactive"
  | "unavailable"
  | "internal_error";

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
  });
}

const PUBLIC_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_payload: "Dados inválidos.",
  unauthorized: "Sessão inválida ou expirada.",
  forbidden: "Operação não autorizada.",
  not_found: "Recurso não encontrado.",
  rate_limited: "Muitas tentativas. Aguarde alguns instantes.",
  replay_detected: "Operação já processada.",
  license_inactive: "Licença inativa ou vencida para este provedor.",
  unavailable: "Serviço indisponível no momento.",
  internal_error: "Não foi possível concluir a operação.",
};

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  invalid_payload: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  replay_detected: 409,
  license_inactive: 403,
  unavailable: 503,
  internal_error: 500,
};

/**
 * Envelope público estável: { ok, code, message }.
 * Mantemos também `error` (string) por compatibilidade com o Stream Play atual.
 */
export function apiError(code: ApiErrorCode, message?: string, extra: Record<string, unknown> = {}) {
  const text = message ?? PUBLIC_MESSAGES[code];
  return jsonResponse({ ok: false, code, message: text, error: text, ...extra }, STATUS_BY_CODE[code]);
}

/* ------------------------------------------------------------------ */
/* Rate limit                                                          */
/* ------------------------------------------------------------------ */

export type RateRule = { bucket: string; limit: number; windowSeconds: number };

export type RateResult = { allowed: boolean; remaining: number; retryAfter: number };

/** Contador por janela fixa persistido no banco (funciona em runtime stateless). */
export async function rateLimit(rule: RateRule, key: string): Promise<RateResult> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
  const keyHash = hashKey(key);

  try {
    const { data: existing } = await supabaseAdmin
      .from("api_rate_limits")
      .select("id, hits")
      .eq("bucket", rule.bucket)
      .eq("key_hash", keyHash)
      .eq("window_start", windowStart)
      .maybeSingle();

    const hits = (existing?.hits ?? 0) + 1;

    if (existing?.id) {
      await supabaseAdmin.from("api_rate_limits").update({ hits }).eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("api_rate_limits")
        .insert({ bucket: rule.bucket, key_hash: keyHash, window_start: windowStart, hits });
    }

    const retryAfter = Math.max(1, Math.ceil((Math.floor(now / windowMs) * windowMs + windowMs - now) / 1000));
    return { allowed: hits <= rule.limit, remaining: Math.max(0, rule.limit - hits), retryAfter };
  } catch (error) {
    // Disponibilidade acima de tudo: falha do contador não derruba o endpoint.
    safeLog("RATE LIMIT", "falha ao contabilizar", { bucket: rule.bucket, error: (error as Error).message });
    return { allowed: true, remaining: rule.limit, retryAfter: 0 };
  }
}

/** Aplica várias regras (ex.: por IP + por identificador). Retorna resposta 429 quando bloqueado. */
export async function enforceRateLimits(
  checks: Array<{ rule: RateRule; key: string }>,
): Promise<Response | null> {
  for (const { rule, key } of checks) {
    const result = await rateLimit(rule, key);
    if (!result.allowed) {
      safeLog("RATE LIMIT", "bloqueado", { bucket: rule.bucket });
      return jsonResponse(
        {
          ok: false,
          code: "rate_limited",
          message: PUBLIC_MESSAGES.rate_limited,
          error: PUBLIC_MESSAGES.rate_limited,
          retry_after: result.retryAfter,
        },
        429,
        { "Retry-After": String(result.retryAfter) },
      );
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Anti-replay                                                         */
/* ------------------------------------------------------------------ */

/** Consome um nonce; retorna false quando já foi usado (replay). */
export async function consumeNonce(nonce: string, scope: string, ttlSeconds = 300): Promise<boolean> {
  const nonceHash = hashKey(`${scope}:${nonce}`);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("api_request_nonces")
    .insert({ nonce_hash: nonceHash, scope, expires_at: expiresAt });
  if (!error) return true;
  if ((error as { code?: string }).code === "23505") return false;
  safeLog("NONCE", "falha ao registrar", { scope });
  return true; // não bloquear por indisponibilidade do controle
}

/* ------------------------------------------------------------------ */
/* Auditoria                                                           */
/* ------------------------------------------------------------------ */

export async function auditLog(entry: {
  action: string;
  actorId?: string | null;
  actorLabel?: string | null;
  target?: string | null;
  severity?: "info" | "warning" | "critical";
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await supabaseAdmin.from("security_audit_log").insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      actor_label: entry.actorLabel ?? null,
      target: entry.target ?? null,
      severity: entry.severity ?? "info",
      metadata: (sanitizeForLog(entry.metadata ?? {}) ?? {}) as Record<string, unknown>,
      ip_hash: entry.ip ? hashKey(entry.ip) : null,
    });
  } catch (error) {
    safeLog("AUDIT", "falha ao registrar", { action: entry.action, error: (error as Error).message });
  }
}
