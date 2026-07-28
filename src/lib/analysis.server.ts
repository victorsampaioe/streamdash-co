// Server-only helpers to analyze a host: DNS records (DoH), HTTP headers,
// geolocation/ASN, and TLS certificate info via crt.sh.

const DOH = "https://cloudflare-dns.com/dns-query";

async function doh(name: string, type: string): Promise<Array<{ data: string; TTL?: number }>> {
  try {
    const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { Answer?: Array<{ data: string; TTL?: number; type: number }> };
    return (j.Answer ?? []).map((a) => ({ data: a.data.replace(/\.$/, ""), TTL: a.TTL }));
  } catch {
    return [];
  }
}

function detectCdn(headers: Headers): { is_cloudflare: boolean; cdn_provider: string | null } {
  const server = (headers.get("server") ?? "").toLowerCase();
  const via = (headers.get("via") ?? "").toLowerCase();
  const xCache = (headers.get("x-cache") ?? "").toLowerCase();
  const cfRay = headers.get("cf-ray");
  const xAmz = headers.get("x-amz-cf-id");
  const xFastly = headers.get("x-served-by") ?? headers.get("x-timer");
  const xAkamai = headers.get("x-akamai-transformed");

  if (cfRay || server.includes("cloudflare")) return { is_cloudflare: true, cdn_provider: "Cloudflare" };
  if (xAmz || server.includes("cloudfront")) return { is_cloudflare: false, cdn_provider: "AWS CloudFront" };
  if (xFastly || server.includes("fastly")) return { is_cloudflare: false, cdn_provider: "Fastly" };
  if (xAkamai || via.includes("akamai")) return { is_cloudflare: false, cdn_provider: "Akamai" };
  if (server.includes("vercel")) return { is_cloudflare: false, cdn_provider: "Vercel" };
  if (server.includes("netlify")) return { is_cloudflare: false, cdn_provider: "Netlify" };
  if (xCache.includes("hit") || xCache.includes("miss")) return { is_cloudflare: false, cdn_provider: "CDN genérico" };
  return { is_cloudflare: false, cdn_provider: null };
}

async function geoIp(ip: string) {
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "StreamMonitor/1.0" },
    });
    if (!r.ok) return null;
    const j = await r.json() as {
      country_name?: string; city?: string; asn?: string; org?: string;
    };
    return {
      country: j.country_name ?? null,
      city: j.city ?? null,
      asn: j.asn ?? null,
      org: j.org ?? null,
    };
  } catch { return null; }
}

async function certHistory(host: string): Promise<Array<{ issuer: string; not_before: string; not_after: string }>> {
  try {
    const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json`, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "StreamMonitor/1.0" },
    });
    if (!r.ok) return [];
    const arr = await r.json() as Array<{ issuer_name: string; not_before: string; not_after: string }>;
    return arr.slice(0, 10).map((c) => ({
      issuer: c.issuer_name,
      not_before: c.not_before,
      not_after: c.not_after,
    }));
  } catch { return []; }
}

export type HostAnalysis = {
  is_cloudflare: boolean;
  cdn_provider: string | null;
  ipv4: string[];
  ipv6: string[];
  nameservers: string[];
  ttl_seconds: number | null;
  ssl_issuer: string | null;
  ssl_expires_at: string | null;
  ssl_algorithm: string | null;
  country: string | null;
  city: string | null;
  asn: string | null;
  org: string | null;
  response_ms: number | null;
  cert_history: Array<{ issuer: string; not_before: string; not_after: string }>;
  raw: { analyzed_at: string; http_ok: boolean };
};

export async function analyzeHost(host: string): Promise<HostAnalysis> {
  const clean = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  const [aRec, aaaaRec, nsRec, headHttp, certs] = await Promise.all([
    doh(clean, "A"),
    doh(clean, "AAAA"),
    doh(clean, "NS"),
    (async () => {
      const started = Date.now();
      try {
        const r = await fetch(`https://${clean}/`, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(6000),
          headers: { "user-agent": "StreamMonitor/1.0" },
        });
        return { ok: r.ok, headers: r.headers, ms: Date.now() - started };
      } catch { return null; }
    })(),
    certHistory(clean),
  ]);

  const ipv4 = aRec.map((r) => r.data).filter((v) => /^\d+\.\d+\.\d+\.\d+$/.test(v));
  const ipv6 = aaaaRec.map((r) => r.data).filter((v) => v.includes(":"));
  const ttl = aRec[0]?.TTL ?? null;

  const cdn = headHttp ? detectCdn(headHttp.headers) : { is_cloudflare: false, cdn_provider: null };
  const geo = ipv4[0] ? await geoIp(ipv4[0]) : null;

  const latestCert = certs[0] ?? null;

  return {
    is_cloudflare: cdn.is_cloudflare,
    cdn_provider: cdn.cdn_provider,
    ipv4,
    ipv6,
    nameservers: nsRec.map((r) => r.data),
    ttl_seconds: ttl,
    ssl_issuer: latestCert?.issuer ?? null,
    ssl_expires_at: latestCert?.not_after ? new Date(latestCert.not_after).toISOString() : null,
    ssl_algorithm: null,
    country: geo?.country ?? null,
    city: geo?.city ?? null,
    asn: geo?.asn ?? null,
    org: geo?.org ?? null,
    response_ms: headHttp?.ms ?? null,
    cert_history: certs,
    raw: {
      analyzed_at: new Date().toISOString(),
      http_ok: headHttp?.ok ?? false,
    },
  };
}
