// Shared helpers used by MCP tools. Server-only.
import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

export type UserSupabase = ReturnType<typeof createClient<Database>>;

function supabaseFetch(key: string): typeof fetch {
  const isNew = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (isNew && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export function supabaseAsUser(ctx: ToolContext): UserSupabase {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    global: {
      fetch: supabaseFetch(key),
      headers: { Authorization: `Bearer ${ctx.getToken()}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthzResult =
  | { ok: true; userId: string; supabase: UserSupabase }
  | { ok: false; error: string };

/**
 * Verifies the caller is authenticated AND has an active subscription.
 * Blocks MCP access when the subscription expired, was cancelled, or never existed.
 */
export async function requireActiveSubscriber(ctx: ToolContext): Promise<AuthzResult> {
  if (!ctx.isAuthenticated()) {
    return { ok: false, error: "Não autenticado. Conecte novamente sua conta Stream Monitor." };
  }
  const userId = ctx.getUserId();
  if (!userId) return { ok: false, error: "Token inválido: usuário não identificado." };

  const supabase = supabaseAsUser(ctx);
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("status, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: `Erro ao verificar assinatura: ${error.message}` };
  if (!sub) {
    return { ok: false, error: "Nenhuma assinatura encontrada. Assine em https://streammonitor.site/app/subscription para usar a integração com IA." };
  }
  const active = (sub.status === "active" || sub.status === "trial") &&
    new Date(sub.expires_at).getTime() > Date.now();
  if (!active) {
    return {
      ok: false,
      error: "Sua assinatura está vencida, cancelada ou inativa. Renove em https://streammonitor.site/app/subscription para reativar a integração com IA.",
    };
  }
  return { ok: true, userId, supabase };
}

export function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}

export function jsonResult(payload: unknown, summary?: string) {
  const text = summary ? `${summary}\n\n${JSON.stringify(payload, null, 2)}` : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export async function logMcpAction(
  ctx: ToolContext,
  userId: string,
  tool: string,
  args: unknown,
  outcome: "ok" | "error",
  detail?: string,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("mcp_activity_log").insert({
      user_id: userId,
      client_id: ctx.getClientId?.() ?? null,
      tool,
      args: args as any,
      outcome,
      detail: detail?.slice(0, 500) ?? null,
    });
  } catch {
    /* logging must never break tool execution */
  }
}
