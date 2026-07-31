// Server-only DNS intelligence engine.
// Multi-resolver resolution, record inventory, propagation, Cloudflare proxy
// detection, DNSSEC, RDAP/WHOIS expiry, health score, diagnosis and alerts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DNS_TIMEOUT_MS = 5000;

export type ResolverResult = {
  code: string;
  name: string;
  country: string;
  ok: boolean;
  ips: string[];
  response_ms: number | null;
  ttl: number | null;
  error: string | null;
};

export type PropagationRegion = {
  code: string;
  name: string;
  flag: string;
  ok: boolean;
  matches: boolean;
  ips: string[];
};

export type DnsReport = {
  host: string;
  checked_at: string;
  resolvers: ResolverResult[];
  consistent: boolean;
  resolved_ok: number;
  resolver_count: number;
  avg_response_ms: number | null;
  min_response_ms: number | null;
  max_response_ms: number | null;
  propagation_pct: number;
  propagation: PropagationRegion[];
  records: Record<string, string[]>;
  primary_ip: string | null;
  ipv4: string[];
  ipv6: string[];
  nameservers: string[];
  ttl_seconds: number | null;
  dnssec: boolean | null;
  cloudflare_proxy: boolean;
  asn: string | null;
  org: string | null;
  country: string | null;
  city: string | null;
  datacenter: string | null;
  domain_expires_at: string | null;
  registrar: string | null;
  status: "ok" | "degraded" | "down";
  diagnosis: string[];
  health_score: number;
};

type DohEndpoint = { code: string; name: string; country: string; base: string; wire?: boolean };

const RESOLVERS: DohEndpoint[] = [
  { code: "cloudflare", name: "Cloudflare 1.1.1.1", country: "Global", base: "https://cloudflare-dns.com/dns-query" },
  { code: "google", name: "Google 8.8.8.8", country: "Global", base: "https://dns.google/resolve" },
  { code: "quad9", name: "Quad9 9.9.9.9", country: "Suíça", base: "https://dns.quad9.net/dns-query", wire: true },
  { code: "opendns", name: "OpenDNS (Cisco)", country: "EUA", base: "https://doh.opendns.com/dns-query", wire: true },
  { code: "adguard", name: "AdGuard DNS", country: "Local/ISP", base: "https://dns.adguard-dns.com/resolve" },
];

const REGIONS: Array<DohEndpoint & { flag: string }> = [
  { code: "us", name: "Estados Unidos", flag: "🇺🇸", country: "EUA", base: "https://dns.google/resolve" },
  { code: "br", name: "Brasil", flag: "🇧🇷", country: "Brasil", base: "https://cloudflare-dns.com/dns-query" },
  { code: "eu", name: "Europa", flag: "🇪🇺", country: "Alemanha", base: "https://dnsforge.de/dns-query", wire: true },
  { code: "as", name: "Ásia", flag: "🇯🇵", country: "Ásia", base: "https://dns.alidns.com/resolve" },
];

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"] as const;

const CF_RANGES = [
  [0x68100000, 0x681fffff], // 104.16.0.0/12
  [0xac400000, 0xac47ffff], // 172.64.0.0/13
  [0xa29e0000, 0xa29effff], // 162.158.0.0/16
  [0xbc720000, 0xbc72ffff], // 188.114.0.0/16
  [0xbe5d0000, 0xbe5dffff], // 190.93.240.0/20 (approx /16)
  [0xc5ea0000, 0xc5eaffff], // 197.234.240.0/22 (approx)
  [0xc6290000, 0xc629ffff], // 198.41.128.0/17 (approx)
  [0x6ca2c000, 0x6ca2ffff], // 108.162.192.0/18
  [0x83191000, 0x83191fff], // 131.0.72.0/22 approx
];

function ipToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const n = p.map(Number);
  if (n.some((x) => Number.isNaN(x) || x < 0 || x > 255)) return null;
  return ((n[0] << 24) >>> 0) + (n[1] << 16) + (n[2] << 8) + n[3];
}

export function isCloudflareIp(ip: string): boolean {
  const v = ipToInt(ip);
  if (v == null) return false;
  return CF_RANGES.some(([a, b]) => v >= a && v <= b);
}

export function normalizeHost(input: string): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(s)) return null;
  return s;
}

type DohAnswer = { name: string; type: number; TTL?: number; data: string };

async function dohQuery(base: string, host: string, type: string) {
  const started = Date.now();
  try {
    const url = `${base}?name=${encodeURIComponent(host)}&type=${type}&do=1`;
    const res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, ms, answers: [] as DohAnswer[], ad: null as boolean | null, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { Status?: number; AD?: boolean; Answer?: DohAnswer[] };
    const answers = (json.Answer ?? []).map((a) => ({ ...a, data: String(a.data).replace(/\.$/, "") }));
    if (json.Status === 3) return { ok: false, ms, answers, ad: json.AD ?? null, error: "NXDOMAIN" };
    return { ok: true, ms, answers, ad: json.AD ?? null, error: null as string | null };
  } catch (e) {
    return { ok: false, ms: null as number | null, answers: [] as DohAnswer[], ad: null as boolean | null, error: e instanceof Error ? e.message : "erro" };
  }
}

function typeCode(t: string): number {
  return { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, SRV: 33 }[t] ?? 1;
}

async function resolveA(ep: DohEndpoint, host: string): Promise<ResolverResult & { raw: DohAnswer[] }> {
  const started = Date.now();
  let ok: boolean;
  let answers: DohAnswer[];
  let error: string | null;
  let ms: number | null;

  if (ep.wire) {
    const { wireQuery } = await import("./dns-wire.server");
    const w = await wireQuery(ep.base, host, 1, DNS_TIMEOUT_MS);
    ms = Date.now() - started;
    ok = w.ok;
    error = w.error;
    answers = w.answers.map((a) => ({ name: host, type: a.type, TTL: a.TTL, data: a.data }));
  } else {
    const r = await dohQuery(ep.base, host, "A");
    ms = r.ms;
    ok = r.ok;
    error = r.error;
    answers = r.answers;
  }

  const ips = answers.filter((a) => a.type === 1).map((a) => a.data);
  return {
    code: ep.code,
    name: ep.name,
    country: ep.country,
    ok: ok && ips.length > 0,
    ips,
    response_ms: ms,
    ttl: answers.find((a) => a.type === 1)?.TTL ?? null,
    error: ok ? (ips.length ? null : "sem registro A") : error,
    raw: answers,
  };
}

async function geoIp(ip: string) {
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "StreamMonitor/1.0" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { country_name?: string; city?: string; asn?: string; org?: string };
    return { country: j.country_name ?? null, city: j.city ?? null, asn: j.asn ?? null, org: j.org ?? null };
  } catch {
    return null;
  }
}

function apexDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const twoLevel = ["com.br", "net.br", "org.br", "co.uk", "com.au", "co.jp"];
  const last2 = parts.slice(-2).join(".");
  if (twoLevel.includes(last2)) return parts.slice(-3).join(".");
  return last2;
}

async function rdap(host: string): Promise<{ expires: string | null; registrar: string | null }> {
  try {
    const r = await fetch(`https://rdap.org/domain/${apexDomain(host)}`, {
      signal: AbortSignal.timeout(7000),
      headers: { accept: "application/rdap+json", "user-agent": "StreamMonitor/1.0" },
    });
    if (!r.ok) return { expires: null, registrar: null };
    const j = (await r.json()) as {
      events?: Array<{ eventAction: string; eventDate: string }>;
      entities?: Array<{ roles?: string[]; vcardArray?: unknown }>;
    };
    const ev = (j.events ?? []).find((e) => e.eventAction === "expiration");
    let registrar: string | null = null;
    const ent = (j.entities ?? []).find((e) => e.roles?.includes("registrar"));
    const vc = (ent?.vcardArray as [string, Array<[string, unknown, string, string]>] | undefined)?.[1];
    if (vc) registrar = vc.find((f) => f[0] === "fn")?.[3] ?? null;
    return { expires: ev ? new Date(ev.eventDate).toISOString() : null, registrar };
  } catch {
    return { expires: null, registrar: null };
  }
}

function scoreOf(r: Omit<DnsReport, "health_score" | "status" | "diagnosis">, recentChanges: number) {
  let score = 100;
  const notes: string[] = [];

  // Disponibilidade
  const failRatio = 1 - r.resolved_ok / Math.max(1, r.resolver_count);
  score -= Math.round(failRatio * 40);
  if (failRatio > 0) notes.push(`${Math.round(failRatio * 100)}% dos resolvedores falharam`);

  // Consistência
  if (!r.consistent) {
    score -= 15;
    notes.push("Resolvedores retornando IPs diferentes");
  }

  // Tempo de resposta
  const avg = r.avg_response_ms ?? 0;
  if (avg > 400) score -= 12;
  else if (avg > 200) score -= 6;
  else if (avg > 100) score -= 2;

  // Propagação
  if (r.propagation_pct < 100) {
    score -= Math.round(((100 - r.propagation_pct) / 100) * 20);
    notes.push("Domínio em propagação");
  }

  // TTL
  if (r.ttl_seconds != null) {
    if (r.ttl_seconds > 86400) { score -= 6; notes.push("TTL muito alto (>24h)"); }
    else if (r.ttl_seconds < 30) { score -= 3; notes.push("TTL muito baixo (<30s)"); }
  }

  // Mudanças recentes
  if (recentChanges > 0) score -= Math.min(10, recentChanges * 4);

  // Bônus proteção
  if (r.cloudflare_proxy) score += 3;
  if (r.dnssec) score += 3;

  return { score: Math.max(0, Math.min(100, score)), notes };
}

function diagnose(r: Omit<DnsReport, "health_score" | "status" | "diagnosis">): { status: "ok" | "degraded" | "down"; diagnosis: string[] } {
  const d: string[] = [];
  let status: "ok" | "degraded" | "down" = "ok";

  if (r.resolved_ok === 0) {
    status = "down";
    d.push((r.records.CNAME?.length ?? 0) > 0 ? "Registro A inexistente — apenas CNAME encontrado." : "Registro A inexistente ou domínio não resolve.");
    if (r.nameservers.length === 0) d.push("Nameservers não encontrados — delegação incorreta.");
  } else if (r.resolved_ok < r.resolver_count) {
    status = "degraded";
    const failed = r.resolvers.filter((x) => !x.ok).map((x) => x.name).join(", ");
    d.push(`Resolução parcial: ${failed} não responderam.`);
  }

  if (!r.consistent) {
    if (status === "ok") status = "degraded";
    d.push("Resolvedores retornando IPs diferentes — possível propagação ou split-DNS.");
  }
  if (r.propagation_pct < 100 && r.propagation_pct > 0) {
    if (status === "ok") status = "degraded";
    d.push(`Propagação em andamento (${r.propagation_pct}%).`);
  }
  if (r.ttl_seconds != null && r.ttl_seconds > 86400) d.push("TTL muito alto — alterações demoram a propagar.");
  if (r.dnssec === false && r.nameservers.length > 0) d.push("DNSSEC não habilitado neste domínio.");
  if (r.domain_expires_at) {
    const days = Math.floor((new Date(r.domain_expires_at).getTime() - Date.now()) / 86400000);
    if (days < 0) { status = "down"; d.push("Domínio expirado."); }
    else if (days < 30) d.push(`Domínio expira em ${days} dias.`);
  }
  if (r.resolved_ok > 0 && d.length === 0) d.push("Nenhum problema detectado na resolução de DNS.");
  return { status, diagnosis: d };
}

export async function analyzeDns(rawHost: string, recentChanges = 0): Promise<DnsReport> {
  const host = normalizeHost(rawHost);
  if (!host) throw new Error("Domínio inválido");

  const [resolverRes, regionRes, recordRes] = await Promise.all([
    Promise.all(RESOLVERS.map((r) => resolveA(r, host))),
    Promise.all(REGIONS.map(async (r) => ({ region: r, res: await resolveA(r, host) }))),
    Promise.all(RECORD_TYPES.map(async (t) => ({ t, r: await dohQuery(RESOLVERS[0].base, host, t) }))),
  ]);

  const records: Record<string, string[]> = {};
  let dnssec: boolean | null = null;
  for (const { t, r } of recordRes) {
    records[t] = r.answers.filter((a) => a.type === typeCode(t)).map((a) => a.data);
    if (t === "A" && r.ad != null) dnssec = r.ad;
  }

  const resolvers: ResolverResult[] = resolverRes.map(({ raw: _raw, ...rest }) => rest);
  const okRes = resolvers.filter((r) => r.ok);

  // Domínios atrás do Cloudflare recebem IPs anycast rotativos do mesmo pool:
  // nesse caso todos os IPs Cloudflare são equivalentes.
  const allCf = okRes.length > 0 && okRes.every((r) => r.ips.every((ip) => isCloudflareIp(ip)));
  const sig = (ips: string[]) => (allCf && ips.every((ip) => isCloudflareIp(ip)) ? "cloudflare" : [...ips].sort().join(","));

  const sigSet = new Set(okRes.map((r) => sig(r.ips)));
  const consistent = sigSet.size <= 1;
  const times = resolvers.map((r) => r.response_ms).filter((v): v is number => v != null);

  const majority = okRes[0]?.ips ?? [];
  const majoritySig = sig(majority);
  const propagation: PropagationRegion[] = regionRes.map(({ region, res }) => ({
    code: region.code,
    name: region.name,
    flag: region.flag,
    ok: res.ok,
    matches: res.ok && sig(res.ips) === majoritySig,
    ips: res.ips,
  }));
  const propagation_pct = Math.round((propagation.filter((p) => p.matches).length / propagation.length) * 100);

  const ipv4 = Array.from(new Set(okRes.flatMap((r) => r.ips)));
  const ipv6 = records.AAAA ?? [];
  const primary_ip = majority[0] ?? ipv4[0] ?? null;
  const cloudflare_proxy = ipv4.some((ip) => isCloudflareIp(ip));

  const [geo, who] = await Promise.all([primary_ip ? geoIp(primary_ip) : Promise.resolve(null), rdap(host)]);

  const base = {
    host,
    checked_at: new Date().toISOString(),
    resolvers,
    consistent,
    resolved_ok: okRes.length,
    resolver_count: resolvers.length,
    avg_response_ms: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    min_response_ms: times.length ? Math.min(...times) : null,
    max_response_ms: times.length ? Math.max(...times) : null,
    propagation_pct,
    propagation,
    records,
    primary_ip,
    ipv4,
    ipv6,
    nameservers: records.NS ?? [],
    ttl_seconds: okRes.find((r) => r.ttl != null)?.ttl ?? null,
    dnssec,
    cloudflare_proxy,
    asn: geo?.asn ?? null,
    org: geo?.org ?? null,
    country: geo?.country ?? null,
    city: geo?.city ?? null,
    datacenter: geo?.org ?? null,
    domain_expires_at: who.expires,
    registrar: who.registrar,
  };

  const { status, diagnosis } = diagnose(base);
  const { score } = scoreOf(base, recentChanges);
  return { ...base, status, diagnosis, health_score: score };
}

type PrevSnapshot = {
  primary_ip: string | null;
  asn: string | null;
  ttl_seconds: number | null;
  cloudflare_proxy: boolean | null;
  status: string;
  checked_at: string;
};

export async function runDnsCheck(serverId: string): Promise<{ ok: boolean; score: number; status: string; alerts: number }> {
  const { data: srv } = await supabaseAdmin.from("servers").select("id, host").eq("id", serverId).maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: recentChanges } = await supabaseAdmin
    .from("dns_ip_history")
    .select("id", { count: "exact", head: true })
    .eq("server_id", serverId)
    .gte("changed_at", since);

  const report = await analyzeDns(srv.host, recentChanges ?? 0);

  const { data: prev } = await supabaseAdmin
    .from("dns_snapshots")
    .select("primary_ip, asn, ttl_seconds, cloudflare_proxy, status, checked_at")
    .eq("server_id", serverId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle<PrevSnapshot>();

  const alerts: Array<{ kind: string; severity: string; title: string; detail: string | null }> = [];

  if (prev) {
    if (prev.primary_ip && report.primary_ip && prev.primary_ip !== report.primary_ip) {
      const { data: lastChange } = await supabaseAdmin
        .from("dns_ip_history")
        .select("changed_at")
        .eq("server_id", serverId)
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ changed_at: string }>();
      const gap = lastChange ? Math.round((Date.now() - new Date(lastChange.changed_at).getTime()) / 1000) : null;
      await supabaseAdmin.from("dns_ip_history").insert({
        server_id: serverId,
        old_ip: prev.primary_ip,
        new_ip: report.primary_ip,
        old_asn: prev.asn,
        new_asn: report.asn,
        record_type: "A",
        seconds_since_previous: gap,
      });
      alerts.push({
        kind: "a_record_changed",
        severity: "critical",
        title: "🚨 O registro A mudou.",
        detail: `${prev.primary_ip} → ${report.primary_ip}`,
      });
      if (prev.asn && report.asn && prev.asn !== report.asn) {
        alerts.push({ kind: "asn_changed", severity: "warning", title: "⚠ O IP mudou de ASN.", detail: `${prev.asn} → ${report.asn}` });
      }
    }
    if (prev.status !== "down" && report.status === "down") {
      alerts.push({ kind: "dns_down", severity: "critical", title: "⚠ O DNS deixou de responder.", detail: report.diagnosis[0] ?? null });
    }
    if (prev.cloudflare_proxy && !report.cloudflare_proxy) {
      alerts.push({ kind: "cf_proxy_off", severity: "warning", title: "⚠ O Proxy Cloudflare foi desativado.", detail: "O domínio passou a expor o IP de origem." });
    }
    if (prev.ttl_seconds != null && report.ttl_seconds != null && prev.ttl_seconds !== report.ttl_seconds) {
      alerts.push({ kind: "ttl_changed", severity: "info", title: "⚠ O TTL foi alterado.", detail: `${prev.ttl_seconds}s → ${report.ttl_seconds}s` });
    }
  }

  if (report.propagation_pct < 100 && report.propagation_pct > 0) {
    alerts.push({ kind: "propagating", severity: "info", title: "⚠ O domínio está propagando.", detail: `Propagação em ${report.propagation_pct}%.` });
  }

  await supabaseAdmin.from("dns_snapshots").insert({
    server_id: serverId,
    checked_at: report.checked_at,
    health_score: report.health_score,
    resolvers: report.resolvers,
    consistent: report.consistent,
    resolved_ok: report.resolved_ok,
    resolver_count: report.resolver_count,
    avg_response_ms: report.avg_response_ms,
    min_response_ms: report.min_response_ms,
    max_response_ms: report.max_response_ms,
    propagation_pct: report.propagation_pct,
    propagation: report.propagation,
    records: report.records,
    primary_ip: report.primary_ip,
    ipv4: report.ipv4,
    ipv6: report.ipv6,
    nameservers: report.nameservers,
    ttl_seconds: report.ttl_seconds,
    dnssec: report.dnssec,
    cloudflare_proxy: report.cloudflare_proxy,
    asn: report.asn,
    org: report.org,
    country: report.country,
    city: report.city,
    datacenter: report.datacenter,
    domain_expires_at: report.domain_expires_at,
    registrar: report.registrar,
    status: report.status,
    diagnosis: report.diagnosis,
  });

  if (alerts.length) {
    await supabaseAdmin.from("dns_alerts").insert(alerts.map((a) => ({ ...a, server_id: serverId })));
  }

  await supabaseAdmin
    .from("servers")
    .update({ last_dns_check_at: report.checked_at, dns_health_score: report.health_score })
    .eq("id", serverId);

  return { ok: true, score: report.health_score, status: report.status, alerts: alerts.length };
}

export async function runDueDnsChecks(limit = 25): Promise<{ checked: number; errors: number }> {
  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select("id, host, dns_interval_minutes, last_dns_check_at")
    .eq("dns_enabled", true)
    .order("last_dns_check_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  let checked = 0;
  let errors = 0;
  for (const s of servers ?? []) {
    const due =
      !s.last_dns_check_at ||
      Date.now() - new Date(s.last_dns_check_at).getTime() >= (s.dns_interval_minutes ?? 10) * 60_000;
    if (!due) continue;
    try {
      await runDnsCheck(s.id);
      checked++;
    } catch {
      errors++;
    }
  }
  return { checked, errors };
}
