/**
 * Máquina de estados do monitoramento — DNS e SERVIDOR são independentes.
 *
 * Regras centrais:
 *  - Falha de DNS NUNCA declara o servidor offline por si só. Se existir um IP
 *    conhecido (histórico) ou HTTPS/Player API respondendo, o servidor continua
 *    ONLINE e apenas o DNS é marcado como instável/offline.
 *  - Servidor só vai a OFFLINE com confirmação (falhas consecutivas ou duas
 *    regiões confirmando).
 *  - Erro de credencial/usuário expirado NÃO é prova de servidor offline.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DnsStatus = "unknown" | "online" | "unstable" | "offline";
export type ServerStatus = "up" | "degraded" | "down" | "unknown";

/** Categorias de falha — usadas para decidir se a culpa é do servidor. */
export type FailureKind =
  | "dns_not_resolved"
  | "connection_refused"
  | "timeout"
  | "http_403"
  | "http_404"
  | "http_5xx"
  | "unavailable"
  | "invalid_credentials"
  | "expired_user"
  | "tls"
  | "none";

/** Falhas que provam indisponibilidade do SERVIDOR (não de credencial/DNS). */
const SERVER_FAULT: ReadonlySet<FailureKind> = new Set<FailureKind>([
  "connection_refused",
  "timeout",
  "http_5xx",
  "unavailable",
]);

export function isServerFault(kind: FailureKind): boolean {
  return SERVER_FAULT.has(kind);
}

export function classifyFailure(raw: unknown, httpStatus?: number | null): FailureKind {
  const s = String(raw ?? "").toLowerCase();
  if (httpStatus && httpStatus >= 500) return "http_5xx";
  if (httpStatus === 403) return "http_403";
  if (httpStatus === 404) return "http_404";
  if (/enotfound|nxdomain|eai_again|dns/.test(s)) return "dns_not_resolved";
  if (/econnrefused|refus/.test(s)) return "connection_refused";
  if (/timeout|etimedout|abort/.test(s)) return "timeout";
  if (/cert|ssl|tls/.test(s)) return "tls";
  if (/invalid.*(user|pass|cred)|auth.*fail|credencial/.test(s)) return "invalid_credentials";
  if (/expired|expirad/.test(s)) return "expired_user";
  if (/ehostunreach|enetunreach|econnreset|epipe|unavailable|indispon/.test(s)) return "unavailable";
  if (!s) return "none";
  return "unavailable";
}

const TIMEOUT_MS = 8000;

async function head(url: string, timeout = TIMEOUT_MS) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
      headers: { "user-agent": "StreamMonitor/2.0" },
    });
    return { ok: res.status < 500, status: res.status, ms: Date.now() - started, error: null as string | null };
  } catch (e: any) {
    return {
      ok: false,
      status: null as number | null,
      ms: Date.now() - started,
      error: e?.name === "TimeoutError" || e?.name === "AbortError" ? "TIMEOUT" : (e?.cause?.code ?? e?.message ?? "erro"),
    };
  }
}

export type ServiceVerdict = {
  /** O serviço IPTV/HTTP respondeu por algum caminho? */
  online: boolean;
  /** Respondeu, mas com sinais de instabilidade. */
  unstable: boolean;
  httpStatus: number | null;
  latency: number | null;
  kind: FailureKind;
  detail: string | null;
  /** Caminho que respondeu (http, https, player_api, ip). */
  via: string | null;
};

/** Último IP conhecido do host (para checar o servidor mesmo com DNS quebrado). */
export async function lastKnownIp(serverId: string): Promise<string | null> {
  const { data: snap } = await supabaseAdmin
    .from("dns_snapshots")
    .select("primary_ip")
    .eq("server_id", serverId)
    .not("primary_ip", "is", null)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ primary_ip: string | null }>();
  if (snap?.primary_ip) return snap.primary_ip;
  const { data: chk } = await supabaseAdmin
    .from("checks")
    .select("dns_resolved_ip")
    .eq("server_id", serverId)
    .not("dns_resolved_ip", "is", null)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ dns_resolved_ip: string | null }>();
  return chk?.dns_resolved_ip ?? null;
}

/**
 * Verifica o SERVIÇO real (independente do nome DNS):
 * HTTP → HTTPS → player_api.php → panel_api.php, com fallback pelo IP conhecido.
 */
export async function verifyService(opts: {
  serverId: string;
  host: string;
  port?: number;
  fallbackIp?: string | null;
}): Promise<ServiceVerdict> {
  const { serverId, host } = opts;
  const port = opts.port ?? 80;
  const bases: Array<{ base: string; via: string }> = [
    { base: `http://${host}:${port}`, via: "http" },
    { base: `https://${host}`, via: "https" },
  ];
  if (opts.fallbackIp) bases.push({ base: `http://${opts.fallbackIp}:${port}`, via: "ip" });

  let creds: { username: string | null; password: string | null } = { username: null, password: null };
  try {
    const { getIptvCredentials } = await import("./iptv-credentials.server");
    creds = await getIptvCredentials(serverId);
  } catch {
    /* servidor sem credenciais */
  }

  let last: ServiceVerdict = {
    online: false,
    unstable: false,
    httpStatus: null,
    latency: null,
    kind: "none",
    detail: null,
    via: null,
  };

  for (const { base, via } of bases) {
    // 1) Player API é o sinal mais forte de "servidor vivo".
    if (creds.username && creds.password) {
      const url = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
      const r = await head(url, 10_000);
      if (r.status && r.status < 500) {
        // 200 com auth=0 = credencial inválida: servidor está VIVO.
        return {
          online: true,
          unstable: r.ms > 4000 || r.status >= 400,
          httpStatus: r.status,
          latency: r.ms,
          kind: r.status >= 400 ? classifyFailure(null, r.status) : "none",
          detail: null,
          via: `player_api:${via}`,
        };
      }
      last = {
        online: false,
        unstable: false,
        httpStatus: r.status,
        latency: r.ms,
        kind: classifyFailure(r.error, r.status),
        detail: r.error,
        via: `player_api:${via}`,
      };
    }

    // 2) Porta HTTP/HTTPS crua.
    const r = await head(`${base}/`);
    if (r.status != null && r.status < 500) {
      return {
        online: true,
        unstable: r.ms > 4000,
        httpStatus: r.status,
        latency: r.ms,
        kind: "none",
        detail: null,
        via,
      };
    }
    last = {
      online: false,
      unstable: false,
      httpStatus: r.status,
      latency: r.ms,
      kind: classifyFailure(r.error, r.status),
      detail: r.error,
      via,
    };
  }

  return last;
}

/** Consenso regional recente: quantas regiões distintas falharam/passaram. */
export async function regionConsensus(serverId: string, windowMinutes = 10) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("region_checks")
    .select("region_code, status, checked_at")
    .eq("server_id", serverId)
    .gte("checked_at", since);
  const failed = new Set<string>();
  const ok = new Set<string>();
  for (const r of data ?? []) {
    if ((r as any).status === "down") failed.add((r as any).region_code);
    else ok.add((r as any).region_code);
  }
  return { failedRegions: [...failed], okRegions: [...ok] };
}

/** Confirmação exigida antes de declarar OFFLINE. */
export const OFFLINE_MIN_FAILURES = 2;
/** Com um único agente/região não há consenso geográfico: exigimos mais falhas. */
export const OFFLINE_MIN_FAILURES_SINGLE_REGION = 3;

/**
 * Quantos agentes/regiões estão realmente reportando agora.
 * Considera agentes VPS habilitados vistos recentemente e regiões que
 * enviaram checagens na janela. Nunca retorna menos de 1 (a origem).
 */
export async function activeRegionCount(windowMinutes = 15): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const regions = new Set<string>();

  try {
    const { data } = await (supabaseAdmin as any)
      .from("region_agents")
      .select("region_code, enabled, last_seen_at")
      .eq("enabled", true)
      .gte("last_seen_at", since);
    for (const a of data ?? []) if (a?.region_code) regions.add(String(a.region_code));
  } catch {
    /* tabela indisponível: segue com o que houver */
  }

  try {
    const { data } = await supabaseAdmin
      .from("region_checks")
      .select("region_code")
      .gte("checked_at", since)
      .limit(2000);
    for (const r of data ?? []) if ((r as any)?.region_code) regions.add(String((r as any).region_code));
  } catch {
    /* idem */
  }

  regions.delete("origin");
  return Math.max(1, regions.size);
}

/**
 * Regra dinâmica de confirmação de offline.
 * - Múltiplas regiões ativas: 2 regiões falhando OU 2 falhas consecutivas.
 * - Uma única região/agente: exige 3 falhas consecutivas.
 */
export function shouldDeclareOffline(
  consecutiveFailures: number,
  failedRegions: number,
  activeRegions = 1,
): boolean {
  if (activeRegions >= 2) {
    return consecutiveFailures >= OFFLINE_MIN_FAILURES || failedRegions >= 2;
  }
  return consecutiveFailures >= OFFLINE_MIN_FAILURES_SINGLE_REGION;
}


/** Backoff de recheck para servidores com problema (em segundos). */
export function recheckDelaySeconds(status: ServerStatus | DnsStatus, failures: number, normal: number): number {
  if (status === "down" || status === "offline") {
    if (failures <= 1) return 120;
    if (failures === 2) return 300;
    if (failures === 3) return 600;
    return Math.max(normal, 900);
  }
  if (status === "degraded" || status === "unstable") return Math.max(60, Math.floor(normal / 2));
  return normal;
}

/** Prioridade da fila: 1 = urgente, 3 = rotina. */
export function computePriority(input: {
  serverStatus: string | null;
  dnsStatus: string | null;
  hasOpenIncident: boolean;
  overdue: boolean;
}): 1 | 2 | 3 {
  if (input.serverStatus === "down" || input.dnsStatus === "offline" || input.hasOpenIncident || input.overdue) return 1;
  if (input.serverStatus === "degraded" || input.dnsStatus === "unstable") return 2;
  return 3;
}
