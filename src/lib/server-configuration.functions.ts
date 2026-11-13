import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { validateOutboundUrl } from "./ssrf-guard";

const uuid = z.string().uuid();
const optionalCredentials = z.object({
  username: z.string().max(200).default(""),
  password: z.string().max(200).default(""),
});

function canonicalDns(raw: string): string {
  let value = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // A hostname and optionally a port, never credentials, paths or query strings.
  if (/[\s\\/?#@]/.test(value)) throw new Error("Informe apenas o domínio ou IP com porta opcional, sem caminho ou credenciais.");
  const parts = /^([^:]+)(?::(\d{1,5}))?$/.exec(value);
  if (!parts) throw new Error("DNS inválido.");
  const hostname = parts[1];
  const port = parts[2] ? Number(parts[2]) : null;
  if (port !== null && (port < 1 || port > 65535)) throw new Error("A porta informada não é válida.");
  const domain = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  const ipv4Like = /^\\d+(?:\\.\\d+){3}$/.test(hostname);
  const isValidIPv4 = ipv4Like && hostname.split(".").every(octet => octet.length <= 3 && Number(octet) <= 255);
  if ((ipv4Like && !isValidIPv4) || (!domain.test(hostname) && !isValidIPv4)) {
    throw new Error("Informe um domínio público ou IPv4 válido.");
  }
  const url = validateOutboundUrl("http://" + value);
  if (!url.safe) throw new Error("DNS privado ou não autorizado para monitoramento.");
  return value;
}
function credentialChoice(username: string, password: string) {
  const u = username.trim();
  const p = password.trim();
  if (Boolean(u) !== Boolean(p)) {
    throw new Error("Para ativar a verificação autenticada, preencha usuário E senha ativos. Ou deixe os dois vazios.");
  }
  return { username: u, password: p, set: !!u && !!p };
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  host: z.string().min(3).max(255),
  description: z.string().max(500).default(""),
  isPublic: z.boolean().default(false),
}).merge(optionalCredentials);

export const createMonitoredServer = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((input: z.input<typeof createSchema>) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const host = canonicalDns(data.host);
    const creds = credentialChoice(data.username, data.password);
    // Encrypt BEFORE inserting; never send plaintext credentials via the Data API.
    const { encryptSecret } = await import("./crypto.server");
    const encrypted = creds.set
      ? { username: await encryptSecret(creds.username), password: await encryptSecret(creds.password) }
      : { username: null, password: null };
    const slug = data.isPublic
      ? data.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 45) + "-" + crypto.randomUUID().slice(0, 8)
      : null;
    const { data: created, error } = await context.supabase.from("servers")
      .insert({
        owner_id: context.userId,
        name: data.name.trim(),
        host,
        server_group: data.name.trim(),
        description: data.description.trim() || null,
        is_public: data.isPublic,
        public_slug: slug,
        iptv_username: encrypted.username,
        iptv_password: encrypted.password,
        iptv_mode: creds.set ? "smart" : "basic",
        dns_enabled: true,
        next_check_at: new Date().toISOString(),
      }).select("id").single();
    if (error || !created) throw new Error(error?.message || "Não foi possível cadastrar o servidor.");
    return { id: created.id, authenticatedMonitoring: creds.set };
  });

const configSchema = z.object({ serverId: uuid });
export const getMonitoredServerConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.input<typeof configSchema>) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: server, error } = await (context.supabase as any).from("servers")
      .select("id,owner_id,host,iptv_username,iptv_password,iptv_mode,host_changed_at")
      .eq("id", data.serverId).eq("owner_id", context.userId).maybeSingle();
    if (error || !server) throw new Error("Servidor não encontrado ou sem permissão para alterar.");
    return {
      host: server.host,
      hasCredentials: !!(server.iptv_username && server.iptv_password),
      hostChangedAt: (server as typeof server & { host_changed_at?: string | null }).host_changed_at ?? null,
    };
  });

const updateSchema = z.object({
  serverId: uuid,
  host: z.string().min(3).max(255),
  username: z.string().max(200).default(""),
  password: z.string().max(200).default(""),
  removeCredentials: z.boolean().default(false),
});

export const updateMonitoredServerConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof updateSchema>) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const host = canonicalDns(data.host);
    const creds = credentialChoice(data.username, data.password);
    if (data.removeCredentials && creds.set) throw new Error("Escolha remover as credenciais OU informar novas.");
    const { data: current, error: lookupError } = await context.supabase.from("servers")
      .select("id,owner_id,host,iptv_username,iptv_password,iptv_mode")
      .eq("id", data.serverId).eq("owner_id", context.userId).maybeSingle();
    if (lookupError || !current) throw new Error("Servidor não encontrado ou sem permissão.");

    const changedHost = current.host !== host;
    const changingCredentials = creds.set || data.removeCredentials;
    if (!changedHost && !changingCredentials) return { changedHost: false, changedCredentials: false };

    const patch: Record<string, unknown> = {};
    if (changingCredentials) {
      const { encryptSecret } = await import("./crypto.server");
      patch.iptv_username = creds.set ? await encryptSecret(creds.username) : null;
      patch.iptv_password = creds.set ? await encryptSecret(creds.password) : null;
      patch.iptv_mode = creds.set ? (current.iptv_mode === "full" ? "full" : "smart") : "basic";
      patch.last_iptv_sync_at = null;
      patch.iptv_detected = "none";
      patch.health_score = null;
    } else if (changedHost && current.iptv_username && current.iptv_password) {
      // Preserve existing encrypted login if the reseller is only switching DNS.
      patch.iptv_mode = current.iptv_mode === "full" ? "full" : "smart";
    }

    if (changedHost) {
      Object.assign(patch, {
        host, host_changed_at: new Date().toISOString(),
        current_status: "unknown",
        last_checked_at: null,
        last_latency_ms: null,
        last_http_status: null,
        last_error: null,
        consecutive_failures: 0,
        last_success_at: null,
        last_failure_at: null,
        last_state_change_at: null,
        next_check_at: new Date().toISOString(),
        check_priority: 1,
        dns_status: "unknown",
        dns_failure_count: 0,
        dns_last_success_at: null,
        dns_last_failure_at: null,
        dns_state_changed_at: null,
        dns_health_score: null,
        dns_regions: null,
        last_dns_check_at: null,
        dns_recovery_last_probe_at: null,
        dns_recovery_success_streak: 0,
        dns_enabled: true,
        last_iptv_sync_at: null,
        iptv_detected: "none",
        health_score: null,
        catalog_synced_at: null,
        catalog_hash: null,
        catalog_sync_ms: null,
        ssl_days_remaining: null,
        kuma_synced_at: null,
        kuma_error: null,
      });
    }
    // RLS and explicit owner predicate BOTH apply. No admin cross-account editing.
    const { data: saved, error } = await context.supabase.from("servers")
      .update(patch as never)
      .eq("id", data.serverId).eq("owner_id", context.userId)
      .select("id").maybeSingle();
    if (error || !saved) throw new Error(error?.message || "Não foi possível salvar a nova DNS.");

    if (changedHost) {
      // End former-domain incidents; never send a fake DNS recovered notification.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: incidentError } = await supabaseAdmin.from("incidents")
        .update({ ended_at: new Date().toISOString() })
        .eq("server_id", data.serverId).is("ended_at", null);
      if (incidentError) console.error("[host-change] failed to close old incidents", incidentError.code);
      // Old catalogue entries are not evidence that they are on the NEW DNS.
      const { error: catalogueError } = await supabaseAdmin.from("iptv_catalog_matches")
        .delete().eq("server_id", data.serverId);
      if (catalogueError) console.error("[host-change] failed to clear old catalogue", catalogueError.code);
      const { error: analysisError } = await supabaseAdmin.from("server_analysis")
        .delete().eq("server_id", data.serverId);
      if (analysisError) console.error("[host-change] failed to reset old analysis", analysisError.code);
    }
    if (changingCredentials || changedHost) {
      const { resetLoginAttempts } = await import("./iptv-credentials.server");
      await resetLoginAttempts(data.serverId);
    }
    return { changedHost, changedCredentials: changingCredentials };
  });
