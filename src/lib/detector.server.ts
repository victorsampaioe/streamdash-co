// Block detector: runs DNS-over-HTTPS queries against several resolvers plus
// a direct HTTP check, and derives a verdict.
// Kept in a *.server.ts helper so it is never bundled to the client.

const DNS_TIMEOUT_MS = 4000;
const HTTP_TIMEOUT_MS = 6000;

export type Resolver = {
  code: string;
  name: string;
  country: string;
  url: (host: string) => string;
};

const RESOLVERS: Resolver[] = [
  {
    code: "cloudflare",
    name: "Cloudflare 1.1.1.1",
    country: "Global",
    url: (h) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(h)}&type=A`,
  },
  {
    code: "google",
    name: "Google 8.8.8.8",
    country: "Global",
    url: (h) => `https://dns.google/resolve?name=${encodeURIComponent(h)}&type=A`,
  },
  {
    code: "quad9",
    name: "Quad9 9.9.9.9",
    country: "Suíça",
    url: (h) => `https://dns.quad9.net:5053/dns-query?name=${encodeURIComponent(h)}&type=A`,
  },
  {
    code: "opendns",
    name: "OpenDNS (Cisco)",
    country: "EUA",
    url: (h) => `https://doh.opendns.com/dns-query?name=${encodeURIComponent(h)}&type=A`,
  },
];

export type DnsResult = {
  code: string;
  name: string;
  country: string;
  ok: boolean;
  answers: string[];
  latencyMs: number | null;
  error: string | null;
};

export type HttpResult = {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  redirected: boolean;
  finalUrl: string | null;
  error: string | null;
};

export type Verdict = "ok" | "dns_blocked" | "geo_blocked" | "firewall" | "unreachable" | "inconclusive";

export type DetectorReport = {
  host: string;
  generated_at: string;
  dns: DnsResult[];
  http: HttpResult;
  verdict: Verdict;
  summary: string;
  distinct_ips: string[];
};

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeHost(input: string): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;
  // strip scheme + path
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  if (!HOST_RE.test(s)) return null;
  return s;
}

async function queryResolver(r: Resolver, host: string): Promise<DnsResult> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DNS_TIMEOUT_MS);
  try {
    const res = await fetch(r.url(host), {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    clearTimeout(t);
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { code: r.code, name: r.name, country: r.country, ok: false, answers: [], latencyMs, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as { Status?: number; Answer?: Array<{ type: number; data: string }> };
    const answers = (json.Answer ?? [])
      .filter((a) => a.type === 1)
      .map((a) => a.data)
      .filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    const nx = json.Status === 3;
    const ok = !nx && answers.length > 0;
    return {
      code: r.code,
      name: r.name,
      country: r.country,
      ok,
      answers,
      latencyMs,
      error: nx ? "NXDOMAIN" : answers.length === 0 ? "sem resposta A" : null,
    };
  } catch (e: unknown) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : "erro";
    return { code: r.code, name: r.name, country: r.country, ok: false, answers: [], latencyMs: null, error: msg };
  }
}

async function checkHttp(host: string): Promise<HttpResult> {
  const started = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://${host}/`, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "StreamMonitor/1.0 (+https://streammonitor.site)" },
    });
    clearTimeout(t);
    return {
      ok: res.status >= 200 && res.status < 500,
      status: res.status,
      latencyMs: Date.now() - started,
      redirected: res.redirected,
      finalUrl: res.url || null,
      error: null,
    };
  } catch (e: unknown) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : "erro";
    return { ok: false, status: null, latencyMs: Date.now() - started, redirected: false, finalUrl: null, error: msg };
  }
}

function derive(host: string, dns: DnsResult[], http: HttpResult): { verdict: Verdict; summary: string; distinct_ips: string[] } {
  const resolved = dns.filter((d) => d.ok);
  const failed = dns.filter((d) => !d.ok);
  const distinct = Array.from(new Set(dns.flatMap((d) => d.answers)));

  if (resolved.length === 0) {
    return {
      verdict: "dns_blocked",
      summary: `Nenhum resolver DNS público conseguiu resolver ${host}. Provável bloqueio de DNS, domínio inexistente ou censura.`,
      distinct_ips: distinct,
    };
  }
  if (failed.length > 0 && resolved.length > 0) {
    const list = failed.map((f) => f.name).join(", ");
    return {
      verdict: "dns_blocked",
      summary: `DNS inconsistente: ${list} não resolveram, mas outros sim. Possível filtro de DNS por provedor.`,
      distinct_ips: distinct,
    };
  }
  if (distinct.length > 1) {
    // Different answers per resolver may indicate geo split or DNS manipulation
    const perResolver = new Set(resolved.map((r) => r.answers.slice().sort().join(",")));
    if (perResolver.size > 1) {
      return {
        verdict: "geo_blocked",
        summary: `Resolvers retornaram IPs diferentes para ${host}. Pode indicar CDN geo-particionada ou manipulação de DNS.`,
        distinct_ips: distinct,
      };
    }
  }
  if (!http.ok) {
    if (http.error) {
      return {
        verdict: "firewall",
        summary: `DNS resolveu normalmente, mas HTTPS falhou: ${http.error}. Pode ser firewall, bloqueio de porta ou instabilidade.`,
        distinct_ips: distinct,
      };
    }
    return {
      verdict: "unreachable",
      summary: `DNS resolveu, mas o servidor respondeu HTTP ${http.status ?? "?"}. Serviço fora do ar ou bloqueando requisições.`,
      distinct_ips: distinct,
    };
  }
  return {
    verdict: "ok",
    summary: `Sem sinais de bloqueio detectados. HTTPS respondeu ${http.status} em ${http.latencyMs}ms.`,
    distinct_ips: distinct,
  };
}

// Simple in-memory cache: 5min per host
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; report: DetectorReport }>();

export async function detectBlocks(rawHost: string): Promise<DetectorReport> {
  const host = normalizeHost(rawHost);
  if (!host) throw new Error("Domínio inválido");
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.report;

  const [dns, http] = await Promise.all([
    Promise.all(RESOLVERS.map((r) => queryResolver(r, host))),
    checkHttp(host),
  ]);
  const derived = derive(host, dns, http);
  const report: DetectorReport = {
    host,
    generated_at: new Date().toISOString(),
    dns,
    http,
    ...derived,
  };
  cache.set(host, { at: Date.now(), report });
  return report;
}
