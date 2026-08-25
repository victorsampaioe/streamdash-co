import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Chave pública do Turnstile (segura para o browser). */
export const getSignupConfig = createServerFn({ method: "GET" }).handler(async () => {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  return { turnstileSiteKey: siteKey };
});

/** Painel admin: proteção de cadastros (24h, rejeições, bloqueios). */
export const getSignupSecurityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_signup_security_report" as any);
    if (error) throw new Error(error.message);
    return data as {
      created_24h: number;
      rejected_24h: number;
      by_reason_24h: Record<string, number>;
      active_blocks: Array<{ key: string; reason: string; attempts: number; blocked_until: string; created_at: string }>;
      recent: Array<{
        created_at: string;
        status: string;
        reason: string | null;
        ip_masked: string | null;
        email: string | null;
        phone: string | null;
      }>;
    };
  });
