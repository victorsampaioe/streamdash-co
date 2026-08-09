// Server-only helpers for the Radar Brasil dashboard. Professional incident monitoring.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ExternalIncident = {
  provider: string;
  status: "operational" | "degraded" | "partial_outage" | "major_outage" | "maintenance" | "unknown";
  summary: string;
  updated_at: string | null;
  url: string;
  impact?: string;
  recommendation?: string;
};

export type HistoricalIncident = {
  id: string;
  service_name: string;
  status: string;
  description: string;
  started_at: string;
  resolved_at: string | null;
  duration_minutes?: number;
};

const FEEDS: Array<{ provider: string; url: string; kind: "statuspage"; impact: string }> = [
  { provider: "Cloudflare",    url: "https://www.cloudflarestatus.com/api/v2/status.json",   kind: "statuspage", impact: "DNS, CDN, Conexões externas" },
  { provider: "GitHub",        url: "https://www.githubstatus.com/api/v2/status.json",       kind: "statuspage", impact: "Actions, Deploys, Repositórios" },
  { provider: "Discord",       url: "https://discordstatus.com/api/v2/status.json",          kind: "statuspage", impact: "Comunidade, Bots" },
  { provider: "WhatsApp/Meta", url: "https://metastatus.com/api/v2/status.json",             kind: "statuspage", impact: "Mensageria, Login, Webhooks" },
  { provider: "OpenAI",        url: "https://status.openai.com/api/v2/status.json",          kind: "statuspage", impact: "API, Chat, Modelos IA" },
  { provider: "Zoom",          url: "https://status.zoom.us/api/v2/status.json",             kind: "statuspage", impact: "Reuniões, Vídeo" },
  { provider: "Twilio",        url: "https://status.twilio.com/api/v2/status.json",          kind: "statuspage", impact: "SMS, Voz, Mensageria" },
  { provider: "Stripe",        url: "https://status.stripe.com/api/v2/status.json",          kind: "statuspage", impact: "Pagamentos, Checkout" },
  { provider: "PagSeguro",     url: "https://status.pagseguro.uol.com.br/api/v2/status.json",kind: "statuspage", impact: "Pagamentos, Checkout" },
];

const STATUSPAGE_MAP: Record<string, ExternalIncident["status"]> = {
  none: "operational",
  minor: "degraded",
  major: "partial_outage",
  critical: "major_outage",
  maintenance: "maintenance",
};

async function fetchStatuspage(provider: string, url: string, impact: string): Promise<ExternalIncident | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "StreamMonitor-Radar/2.0" } });
    clearTimeout(t);
    if (!r.ok) return { provider, status: "unknown", summary: `HTTP ${r.status}`, updated_at: null, url: url.replace("/api/v2/status.json", ""), impact };
    const j = await r.json() as { status?: { indicator?: string; description?: string; updated_at?: string }; page?: { updated_at?: string } };
    const ind = j.status?.indicator ?? "none";
    const status = STATUSPAGE_MAP[ind] ?? "unknown";
    
    return {
      provider,
      status,
      summary: j.status?.description ?? "Operacional",
      updated_at: j.status?.updated_at ?? j.page?.updated_at ?? null,
      url: url.replace("/api/v2/status.json", ""),
      impact,
      recommendation: status !== "operational" ? "Aguardar normalização antes de investigar servidores." : undefined,
    };
  } catch (e: any) {
    return { provider, status: "unknown", summary: `Sem resposta`, updated_at: null, url: url.replace("/api/v2/status.json", ""), impact };
  }
}

async function syncExternalIncidents(incidents: ExternalIncident[]) {
  const now = new Date().toISOString();
  for (const inc of incidents) {
    const { data: active } = await supabaseAdmin
      .from("external_service_incidents")
      .select("*")
      .eq("service_name", inc.provider)
      .is("resolved_at", null)
      .maybeSingle();

    if (inc.status !== "operational") {
      if (!active) {
        await supabaseAdmin.from("external_service_incidents").insert({
          service_name: inc.provider,
          status: inc.status,
          description: inc.summary,
          impact_assessment: inc.impact,
          source_url: inc.url,
          started_at: inc.updated_at || now,
          last_update_at: now
        } as never);
        
        await notifyExternalIncident(inc, "started");
      } else if (active.status !== inc.status) {
        await supabaseAdmin.from("external_service_incidents")
          .update({ 
            status: inc.status, 
            description: inc.summary, 
            last_update_at: now 
          } as never)
          .eq("id", active.id);
      }
    } else if (active) {
      await supabaseAdmin.from("external_service_incidents")
        .update({ 
          resolved_at: now, 
          last_update_at: now 
        } as never)
        .eq("id", active.id);
      
      await notifyExternalIncident(inc, "resolved");
    }
  }
}

async function notifyExternalIncident(inc: ExternalIncident, event: "started" | "resolved") {
  try {
    const { notifyAdmin } = await import("./admin-telegram.server");
    const statusLabels: Record<string, string> = {
      degraded: "🟡 Degradado",
      partial_outage: "🟠 Instabilidade parcial",
      major_outage: "🔴 Indisponível",
      maintenance: "⚙️ Manutenção",
      operational: "✅ Operacional",
    };

    const message = event === "started" 
      ? `🚨 <b>Incidente externo detectado</b>\n\n` +
        `Serviço: <b>${inc.provider}</b>\n` +
        `Status: ${statusLabels[inc.status] || inc.status}\n\n` +
        `⚠️ <b>Possível impacto:</b>\n${inc.impact}\n\n` +
        `Recomendação: Aguardar normalização antes de investigar servidores.`
      : `✅ <b>Serviço normalizado</b>\n\n` +
        `O serviço <b>${inc.provider}</b> voltou ao funcionamento normal.\n\n` +
        `Monitoramento DNS/IPTV estabilizado para esta fonte.`;

    await notifyAdmin(message);
  } catch (e) {
    console.error("Erro ao notificar incidente externo:", e);
  }
}

export type RadarSnapshot = {
  generated_at: string;
  externalIncidents: ExternalIncident[];
  history: HistoricalIncident[];
};

async function getHistoricalIncidents(): Promise<HistoricalIncident[]> {
  const { data } = await supabaseAdmin
    .from("external_service_incidents")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);
  
  return (data ?? []).map(d => ({
    id: d.id,
    service_name: d.service_name,
    status: d.status,
    description: d.description || "Nenhuma descrição disponível",
    started_at: d.started_at,
    resolved_at: d.resolved_at,
    duration_minutes: d.resolved_at 
      ? Math.round((new Date(d.resolved_at).getTime() - new Date(d.started_at).getTime()) / 60000)
      : undefined
  }));
}

let snapshotCache: { at: number; data: RadarSnapshot } | null = null;
const CACHE_TTL_MS = 60_000;

async function computeRadarSnapshot(): Promise<RadarSnapshot> {
  const incidents = await Promise.all(FEEDS.map((f) => fetchStatuspage(f.provider, f.url, f.impact)));
  const externalIncidents = incidents.filter((r): r is ExternalIncident => !!r);
  
  syncExternalIncidents(externalIncidents).catch(console.error);
  const history = await getHistoricalIncidents();

  return {
    generated_at: new Date().toISOString(),
    externalIncidents,
    history,
  };
}

export async function getRadarSnapshotCached(): Promise<RadarSnapshot> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < CACHE_TTL_MS) return snapshotCache.data;
  const data = await computeRadarSnapshot();
  snapshotCache = { at: now, data };
  return data;
}