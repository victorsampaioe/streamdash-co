// Server-only helpers for the Radar Brasil dashboard. Aggregates internal
// monitoring data and pulls public status feeds from major providers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type FeedIncident = {
  provider: string;
  status: "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
  summary: string;
  updated_at: string | null;
  url: string;
};

const FEEDS: Array<{ provider: string; url: string; kind: "statuspage" }> = [
  { provider: "Cloudflare",    url: "https://www.cloudflarestatus.com/api/v2/status.json",   kind: "statuspage" },
  { provider: "GitHub",        url: "https://www.githubstatus.com/api/v2/status.json",       kind: "statuspage" },
  { provider: "Discord",       url: "https://discordstatus.com/api/v2/status.json",          kind: "statuspage" },
  { provider: "WhatsApp/Meta", url: "https://metastatus.com/api/v2/status.json",             kind: "statuspage" },
  { provider: "Reddit",        url: "https://www.redditstatus.com/api/v2/status.json",       kind: "statuspage" },
  { provider: "OpenAI",        url: "https://status.openai.com/api/v2/status.json",          kind: "statuspage" },
  { provider: "Zoom",          url: "https://status.zoom.us/api/v2/status.json",             kind: "statuspage" },
  { provider: "Twilio",        url: "https://status.twilio.com/api/v2/status.json",          kind: "statuspage" },
  { provider: "Stripe",        url: "https://status.stripe.com/api/v2/status.json",          kind: "statuspage" },
  { provider: "PagSeguro",     url: "https://status.pagseguro.uol.com.br/api/v2/status.json",kind: "statuspage" },
];

const STATUSPAGE_MAP: Record<string, FeedIncident["status"]> = {
  none: "operational",
  minor: "degraded",
  major: "partial_outage",
  critical: "major_outage",
  maintenance: "maintenance",
};

async function fetchStatuspage(provider: string, url: string): Promise<FeedIncident | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "StreamMonitor-Radar/1.0" } });
    clearTimeout(t);
    if (!r.ok) return { provider, status: "unknown", summary: `HTTP ${r.status}`, updated_at: null, url: url.replace("/api/v2/status.json", "") };
    const j = await r.json() as { status?: { indicator?: string; description?: string; updated_at?: string }; page?: { updated_at?: string } };
    const ind = j.status?.indicator ?? "none";
    return {
      provider,
      status: STATUSPAGE_MAP[ind] ?? "unknown",
      summary: j.status?.description ?? "Operational",
      updated_at: j.status?.updated_at ?? j.page?.updated_at ?? null,
      url: url.replace("/api/v2/status.json", ""),
    };
  } catch (e: any) {
    return { provider, status: "unknown", summary: `Sem resposta`, updated_at: null, url: url.replace("/api/v2/status.json", "") };
  }
}

async function getExternalIncidents(): Promise<FeedIncident[]> {
  const results = await Promise.all(FEEDS.map((f) => fetchStatuspage(f.provider, f.url)));
  return results.filter((r): r is FeedIncident => !!r);
}

async function getInternalStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: totalChecks24h }, { count: incidentsOpen }, { count: incidentsClosed }, { count: serversMonitored }] = await Promise.all([
    supabaseAdmin.from("checks").select("*", { count: "exact", head: true }).gte("checked_at", since),
    supabaseAdmin.from("incidents").select("*", { count: "exact", head: true }).is("ended_at", null),
    supabaseAdmin.from("incidents").select("*", { count: "exact", head: true }).gte("started_at", since).not("ended_at", "is", null),
    supabaseAdmin.from("servers").select("*", { count: "exact", head: true }),
  ]);

  const { data: statusRows } = await supabaseAdmin.from("checks").select("status").gte("checked_at", since).limit(20000);
  const total = statusRows?.length ?? 0;
  const ups = statusRows?.filter((r) => r.status === "up").length ?? 0;
  const uptimePct = total > 0 ? (ups / total) * 100 : null;

  return {
    totalChecks24h: totalChecks24h ?? 0,
    incidentsOpen: incidentsOpen ?? 0,
    incidentsClosed24h: incidentsClosed ?? 0,
    serversMonitored: serversMonitored ?? 0,
    uptimePct,
    since,
  };
}

async function getLatencyByRegion() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: regions } = await supabaseAdmin
    .from("check_regions").select("code,name,city,country,flag,latitude,longitude").eq("enabled", true);
  // Lê o resumo horário (algumas centenas de linhas) em vez de dezenas de
  // milhares de verificações detalhadas.
  const { data: checks } = await supabaseAdmin
    .from("region_checks_hourly")
    .select("region_code,total,ups,avg_latency_ms")
    .gte("hour", since)
    .limit(5000);

  const map = new Map<string, { total: number; ups: number; latencySum: number; latencyCount: number }>();
  for (const c of checks ?? []) {
    const m = map.get(c.region_code) ?? { total: 0, ups: 0, latencySum: 0, latencyCount: 0 };
    m.total += c.total ?? 0;
    m.ups += c.ups ?? 0;
    if (typeof c.avg_latency_ms === "number") {
      m.latencySum += c.avg_latency_ms * (c.total ?? 1);
      m.latencyCount += c.total ?? 1;
    }
    map.set(c.region_code, m);
  }

  return (regions ?? []).map((r) => {
    const m = map.get(r.code);
    return {
      code: r.code,
      city: r.city,
      country: r.country,
      flag: r.flag,
      lat: r.latitude,
      lng: r.longitude,
      avgLatencyMs: m && m.latencyCount ? Math.round(m.latencySum / m.latencyCount) : null,
      uptimePct: m && m.total ? Math.round((m.ups / m.total) * 1000) / 10 : null,
      samples: m?.total ?? 0,
    };
  });
}

async function getTopUnstableServers() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("checks_hourly")
    .select("server_id,total,ups,degraded,downs")
    .gte("hour", since)
    .limit(5000);

  const per = new Map<string, { total: number; bad: number }>();
  for (const c of data ?? []) {
    const m = per.get(c.server_id) ?? { total: 0, bad: 0 };
    m.total += c.total ?? 0;
    m.bad += (c.downs ?? 0) + (c.degraded ?? 0);
    per.set(c.server_id, m);
  }

  const withRatio = [...per.entries()]
    .filter(([, m]) => m.total >= 5)
    .map(([id, m]) => ({ id, total: m.total, bad: m.bad, badPct: (m.bad / m.total) * 100 }))
    .sort((a, b) => b.badPct - a.badPct)
    .slice(0, 10);


  if (withRatio.length === 0) return [];

  const ids = withRatio.map((x) => x.id);
  const { data: servers } = await supabaseAdmin
    .from("servers").select("id,name,is_public,public_slug").in("id", ids);
  const byId = new Map((servers ?? []).map((s) => [s.id, s]));

  return withRatio.map((x) => {
    const s = byId.get(x.id);
    return {
      badPct: Math.round(x.badPct * 10) / 10,
      total: x.total,
      bad: x.bad,
      name: s?.is_public ? s.name : "Servidor privado",
      host: null,
      slug: s?.is_public ? s.public_slug : null,
    };
  });
}

let snapshotCache: { at: number; data: RadarSnapshot } | null = null;
const CACHE_TTL_MS = 60_000;

export type RadarSnapshot = Awaited<ReturnType<typeof computeRadarSnapshot>>;

async function computeRadarSnapshot() {
  const [externalIncidents, stats, byRegion, unstable] = await Promise.all([
    getExternalIncidents(),
    getInternalStats(),
    getLatencyByRegion(),
    getTopUnstableServers(),
  ]);
  return {
    generated_at: new Date().toISOString(),
    externalIncidents,
    stats,
    byRegion,
    unstable,
  };
}

export async function getRadarSnapshotCached(): Promise<RadarSnapshot> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < CACHE_TTL_MS) return snapshotCache.data;
  const data = await computeRadarSnapshot();
  snapshotCache = { at: now, data };
  return data;
}
