// Globalping world DNS verification. All credentials and upstream calls are server-only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SERVERS = ["BR", "US", "DE", "JP", "AU"] as const;
const countryNames: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", DE: "Alemanha",
  JP: "Japão", AU: "Austrália",
};
const db = supabaseAdmin as any;
const schema = z.object({ serverId: z.string().uuid() });

type ProbeSummary = {
  country: string;
  countryName: string;
  city: string;
  region: string;
  state: "resolved" | "unresolved" | "unavailable";
  ipAddresses: string[];
  latencyMs: number | null;
  detail: string;
};
type StoredRun = {
  id: string; server_id: string; user_id: string; target_host: string;
  measurement_id: string | null; status: string;
  summary: ProbeSummary[]; error_code: string | null; created_at: string;
};
function onlyDnsHostname(host: string): string {
  const cleaned = host.trim().replace(/^https?:\/\//i, "");
  if (/[/\\?#@\s]/.test(cleaned)) throw new Error("DNS inválida para medição mundial.");
  const hostname = cleaned.replace(/:\d{1,5}$/, "").replace(/\.$/, "").toLowerCase();
  if (hostname.length > 253 ||
    !/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname)) {
    throw new Error("Globalping verifica nomes de domínio públicos. Cadastre uma DNS válida.");
  }
  return hostname;
}

async function ownerServer(context: { userId: string; supabase: any }, serverId: string) {
  const { data, error } = await context.supabase.from("servers")
    .select("id,host").eq("id", serverId).eq("owner_id", context.userId).maybeSingle();
  if (error || !data) throw new Error("Servidor não encontrado ou sem permissão.");
  return { serverId: data.id as string, target: onlyDnsHostname(data.host as string) };
}
function normalizeRun(row: StoredRun) {
  return {
    runId: row.id, target: row.target_host, status: row.status,
    createdAt: row.created_at, results: row.summary ?? [],
    error: row.error_code ?? null,
  };
}
async function tokenServerOnly() {
  // The DB RPC is executable by service_role only. No browser API can call it.
  const { data, error } = await db.rpc("streammonitor_globalping_token_server_only");
  if (error || typeof data !== "string" || data.length < 10)
    throw new Error("Token Globalping não configurado no cofre.");
  return data;
}
function friendly(error: string) {
  const known: Record<string, string> = {
    globalping_shared_hourly_quota: "Limite gratuito compartilhado atingido. Tente novamente na próxima hora.",
    globalping_daily_quota: "Limite diário de 12 verificações mundiais atingido para esta conta.",
    dns_not_owned_or_changed: "A DNS foi alterada. Atualize a página e tente de novo.",
  };
  return known[error] || "Falha ao iniciar a verificação mundial. Tente mais tarde.";
}
function normalizeResults(raw: any): ProbeSummary[] {
  return (Array.isArray(raw?.results) ? raw.results : []).slice(0, 5).map((item: any): ProbeSummary => {
    const probe = item.probe ?? {};
    const result = item.result ?? {};
    const country = typeof probe.country === "string" ? probe.country : "";
    const answers = Array.isArray(result.answers) ? result.answers : [];
    const ips = answers
      .filter((a: any) => a && a.type === "A" && typeof a.value === "string")
      .map((a: any) => a.value).slice(0, 8);
    const finished = result.status === "finished";
    const resolved = finished && result.statusCode === 0 && ips.length > 0;
    const detail = !finished ? "Sonda não concluiu" :
      resolved ? "DNS resolveu endereço IPv4" :
      result.statusCodeName === "NXDOMAIN" ? "Domínio não encontrado" :
      result.statusCodeName === "SERVFAIL" ? "Falha no resolvedor" :
      result.statusCode === 0 ? "Sem registro IPv4" : "Falha de resolução DNS";
    return {
      country, countryName: countryNames[country] ?? country,
      city: typeof probe.city === "string" ? probe.city.slice(0, 80) : "",
      region: typeof probe.region === "string" ? probe.region.slice(0, 80) : "",
      state: !finished ? "unavailable" : resolved ? "resolved" : "unresolved",
      ipAddresses: ips, latencyMs:
        typeof result.timings?.total === "number" ? result.timings.total : null,
      detail,
    };
  });
}
async function latest(context: any, serverId: string): Promise<StoredRun | null> {
  const { data, error } = await db.from("globalping_dns_runs")
    .select("id,user_id,server_id,target_host,measurement_id,status,summary,error_code,created_at")
    .eq("user_id", context.userId).eq("server_id", serverId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Não foi possível consultar o Radar Mundial.");
  return (data as StoredRun | null) ?? null;
}

export const startGlobalpingWorldDns = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: z.input<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { target } = await ownerServer(context, data.serverId);
    let runId: string;
    let created: boolean;
    const { data: reservation, error: reserveError } = await db
      .rpc("streammonitor_reserve_globalping_run", {
        p_user_id: context.userId, p_server_id: data.serverId, p_target: target,
      });
    if (reserveError) throw new Error(friendly(reserveError.message));
    const selected = reservation?.[0];
    if (!selected) throw new Error("Não foi possível reservar o teste mundial.");
    runId = selected.run_id;
    created = selected.is_new;
    if (!created) {
      const row = await latest(context, data.serverId);
      if (!row) throw new Error("Não foi possível recuperar o teste.");
      return normalizeRun(row);
    }
    // Atomic transition prevents duplicate upstream POSTs if a reseller double-clicks.
    const { data: claimed, error: claimError } = await db.from("globalping_dns_runs")
      .update({ status: "starting", updated_at: new Date().toISOString() })
      .eq("id", runId).eq("status", "reserved").select("id");
    if (claimError || !claimed?.length) {
      const row = await latest(context, data.serverId);
      if (!row) throw new Error("Verificação em andamento.");
      return normalizeRun(row);
    }
    try {
      const token = await tokenServerOnly();
      const response = await fetch("https://api.globalping.io/v1/measurements", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          type: "dns", target, inProgressUpdates: true,
          locations: SERVERS.map(country => ({ country, limit: 1 })),
          measurementOptions: { query: { type: "A" } },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(response.status === 429 ? "globalping_rate_limited" :
          response.status === 401 || response.status === 403 ? "globalping_token_invalid" :
          "globalping_upstream_error");
      }
      const remote = await response.json() as { id?: string };
      if (!remote.id || !/^[A-Za-z0-9_-]{8,50}$/.test(remote.id))
        throw new Error("globalping_invalid_response");
      const { error: savedError } = await db.from("globalping_dns_runs")
        .update({
          measurement_id: remote.id, status: "in-progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId).eq("user_id", context.userId);
      if (savedError) throw new Error("globalping_database_unavailable");
      return { runId, target, status: "in-progress", createdAt: new Date().toISOString(),
        results: [], error: null };
    } catch (e) {
      const code = e instanceof Error ? e.message : "globalping_upstream_error";
      await db.from("globalping_dns_runs")
        .update({
          status: "failed",
          error_code: /^(globalping_[a-z_]+)$/.test(code) ? code : "globalping_upstream_error",
          updated_at: new Date().toISOString(),
        }).eq("id", runId).eq("user_id", context.userId);
      const message = code === "globalping_rate_limited"
        ? "A franquia do Globalping está temporariamente esgotada."
        : code === "globalping_token_invalid"
          ? "O token do Globalping precisa ser atualizado no backend."
          : "A verificação mundial não pôde iniciar. Tente novamente.";
      throw new Error(message);
    }
  });

export const getGlobalpingWorldDns = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: z.input<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { target } = await ownerServer(context, data.serverId);
    const row = await latest(context, data.serverId);
    if (!row || row.target_host !== target) return null;
    if (row.status !== "in-progress" || !row.measurement_id) return normalizeRun(row);
    // Prevent excessive GET polling: 2 requests/sec is the Globalping ceiling.
    const token = await tokenServerOnly();
    let response: Response;
    try {
      response = await fetch(
        `https://api.globalping.io/v1/measurements/${encodeURIComponent(row.measurement_id)}`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: AbortSignal.timeout(13000),
        }
      );
    } catch {
      return normalizeRun(row);
    }
    if (response.status === 429 || !response.ok) return normalizeRun(row);
    const raw = await response.json();
    const summary = normalizeResults(raw);
    const status = raw.status === "in-progress" ? "in-progress" : "finished";
    const { error } = await db.from("globalping_dns_runs").update({
      status, summary,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("user_id", context.userId);
    if (error) throw new Error("Falha ao salvar resultado do Radar Mundial.");
    return normalizeRun({ ...row, status, summary });
  });
