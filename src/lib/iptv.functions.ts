import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

export const detectIptvNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id, host")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { getIptvCredentials } = await import("./iptv-credentials.server");
    const creds = await getIptvCredentials(srv.id);
    const { detectIptvKind } = await import("./iptv.server");
    const res = await detectIptvKind(srv.host, creds.username, creds.password);

    const { error } = await context.supabase
      .from("servers")
      .update({ iptv_detected: res.kind })
      .eq("id", srv.id);
    if (error) throw new Error(error.message);

    return { kind: res.kind };
  });

/**
 * Etapa 1 — valida apenas o login Xtream (DNS + usuário + senha).
 * Não consulta catálogo: confirma resposta do servidor, credenciais e status
 * da conta (ativa/expirada), como faz um app IPTV ao entrar.
 */
export const validateIptvLogin = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id, host")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { getIptvCredentials, checkLoginGuard, guardMessage, registerLoginResult } = await import(
      "./iptv-credentials.server"
    );
    const creds = await getIptvCredentials(srv.id);
    if (!creds.username || !creds.password) {
      throw new Error("Configure usuário e senha Xtream antes de validar o login.");
    }
    const guard = await checkLoginGuard(srv.id);
    if (!guard.allowed) throw new Error(guardMessage(guard));

    const { validateXtreamLogin } = await import("./iptv.server");
    const res = await validateXtreamLogin(srv.host, creds.username, creds.password);
    if (res.login_checked) await registerLoginResult(srv.id, res.login_ok, res.error);
    return res;
  });


export const runIptvSyncNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string; mode?: "smart" | "full" }) =>
    z.object({ serverId: z.string().uuid(), mode: z.enum(["smart", "full"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { runIptvSync } = await import("./iptv.server");
    const result = await runIptvSync(data.serverId, { mode: data.mode ?? "smart", force: true });
    return result;
  });

export const acknowledgeIptvAlert = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { alertId: string }) => z.object({ alertId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("iptv_alerts")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", data.alertId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testPlayerApiUserAgents = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id, host")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { getIptvCredentials, checkLoginGuard, guardMessage } = await import("./iptv-credentials.server");
    const creds = await getIptvCredentials(srv.id);
    if (!creds.username || !creds.password) {
      throw new Error("Configure usuário e senha Xtream antes de executar o teste.");
    }
    const guard = await checkLoginGuard(srv.id);
    if (!guard.allowed) throw new Error(guardMessage(guard));

    const { comparePlayerApiUserAgents } = await import("./iptv.server");
    return await comparePlayerApiUserAgents(srv.host, creds.username, creds.password);
  });

/** Salva credenciais Xtream sempre criptografadas (nunca em texto puro). */
export const saveIptvCredentials = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string; username: string | null; password: string | null }) =>
    z
      .object({
        serverId: z.string().uuid(),
        username: z.string().max(200).nullable(),
        password: z.string().max(200).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Confirma a posse do servidor via RLS antes de tocar nas credenciais.
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const { setIptvCredentials } = await import("./iptv-credentials.server");
    await setIptvCredentials(srv.id, {
      username: data.username?.trim() || null,
      password: data.password?.trim() || null,
    });
    return { ok: true };
  });

/** Estado do bloqueio anti força bruta do login Xtream. */
export const getIptvLoginGuard = createServerFn({ method: "GET" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { serverId: string }) => z.object({ serverId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: srv } = await context.supabase
      .from("servers")
      .select("id")
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");
    const { checkLoginGuard } = await import("./iptv-credentials.server");
    return await checkLoginGuard(srv.id);
  });
