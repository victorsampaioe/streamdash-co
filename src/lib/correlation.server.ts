// DNS Correlation Intelligence — server-only.
// Correlaciona a falha de uma DNS com as demais DNS do MESMO servidor cadastrado
// (agrupamento por `server_group`, com fallback para o nome do servidor).
import { promises as dns } from "node:dns";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PROBE_TIMEOUT_MS = 6000;

export type CorrelationVerdict = "isolated" | "partial" | "server_down" | "healthy";

export type RelatedDns = {
  id: string;
  name: string;
  host: string;
  status: "up" | "down";
  latency_ms: number | null;
  is_failed: boolean;
};

export type CorrelationResult = {
  groupKey: string;
  verdict: CorrelationVerdict;
  confidence: number;
  total: number;
  online: number;
  offline: number;
  related: RelatedDns[];
  headline: string;
  summary: string;
};

export function groupKeyOf(server: { name: string; server_group?: string | null }) {
  const g = (server.server_group ?? "").trim();
  return g.length > 0 ? g : server.name;
}

async function quickProbe(host: string): Promise<{ ok: boolean; ms: number | null }> {
  const t0 = Date.now();
  try {
    await dns.lookup(host, { all: false });
  } catch {
    return { ok: false, ms: null };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`http://${host}:80/`, { method: "GET", redirect: "manual", signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.status < 500, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

/**
 * Analisa todas as DNS vinculadas ao mesmo servidor cadastrado e classifica o incidente.
 * Não altera o monitoramento; é apenas uma camada de diagnóstico.
 */
export async function analyzeCorrelation(server: {
  id: string;
  owner_id: string;
  name: string;
  host: string;
  server_group?: string | null;
}): Promise<CorrelationResult> {
  const groupKey = groupKeyOf(server);

  const { data: siblings } = await supabaseAdmin
    .from("servers")
    .select("id, name, host, server_group")
    .eq("owner_id", server.owner_id);

  const members = (siblings ?? []).filter(
    (s: any) => groupKeyOf(s) === groupKey && s.id !== server.id,
  );

  const probes = await Promise.all(members.map(async (m: any) => {
    const r = await quickProbe(m.host);
    return {
      id: m.id as string,
      name: m.name as string,
      host: m.host as string,
      status: (r.ok ? "up" : "down") as "up" | "down",
      latency_ms: r.ms,
      is_failed: false,
    } satisfies RelatedDns;
  }));

  const related: RelatedDns[] = [
    { id: server.id, name: server.name, host: server.host, status: "down", latency_ms: null, is_failed: true },
    ...probes,
  ];

  const total = related.length;
  const offline = related.filter((r) => r.status === "down").length;
  const online = total - offline;

  let verdict: CorrelationVerdict;
  if (offline === 0) verdict = "healthy";
  else if (offline >= total) verdict = "server_down";
  else if (offline === 1 && total > 1) verdict = "isolated";
  else verdict = "partial";

  // Confiança: quanto maior a proporção de DNS que concordam com o veredito
  // e quanto mais DNS vinculadas, maior a certeza do diagnóstico.
  const agree = verdict === "server_down" ? offline : verdict === "isolated" ? online : Math.max(offline, online);
  const base = total > 0 ? (agree / total) * 100 : 0;
  const sample = total >= 3 ? 1 : total === 2 ? 0.9 : 0.6;
  const confidence = Math.max(30, Math.min(99, Math.round(base * sample)));

  const headline =
    verdict === "server_down" ? "🔴 QUEDA REAL DO SERVIDOR"
    : verdict === "partial" ? "🟡 INSTABILIDADE PARCIAL"
    : verdict === "isolated" ? "🟢 PROBLEMA ISOLADO NA DNS"
    : "✅ Servidor respondendo";

  const summary =
    verdict === "server_down"
      ? "Possível indisponibilidade do servidor. Todas as DNS vinculadas apresentam falha."
      : verdict === "partial"
        ? "Detectamos instabilidade parcial no servidor. Algumas conexões apresentam falha."
        : verdict === "isolated"
          ? "Detectamos uma falha isolada na DNS. O servidor principal continua online."
          : "Nenhuma DNS vinculada apresenta falha no momento.";

  return { groupKey, verdict, confidence, total, online, offline, related, headline, summary };
}

/** Salva o evento de correlação no histórico e devolve o id criado. */
export async function recordCorrelationEvent(
  server: { id: string; owner_id: string; host: string },
  c: CorrelationResult,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("dns_correlation_events")
    .insert({
      owner_id: server.owner_id,
      server_id: server.id,
      group_key: c.groupKey,
      failed_host: server.host,
      verdict: c.verdict,
      confidence: c.confidence,
      online_count: c.online,
      offline_count: c.offline,
      total_count: c.total,
      related: c.related as any,
      summary: c.summary,
    })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

/** Fecha o evento aberto do servidor, registrando o tempo até a recuperação. */
export async function closeCorrelationEvent(serverId: string) {
  const { data: open } = await supabaseAdmin
    .from("dns_correlation_events")
    .select("id, created_at")
    .eq("server_id", serverId)
    .is("recovered_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return null;
  const now = new Date();
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(open.created_at).getTime()) / 1000));
  await supabaseAdmin
    .from("dns_correlation_events")
    .update({ recovered_at: now.toISOString(), recovery_seconds: seconds })
    .eq("id", open.id);
  return seconds;
}

/** Mensagem consolidada de diagnóstico inteligente (Telegram/Discord/e-mail). */
export function correlationMessage(
  server: { name: string; host: string },
  c: CorrelationResult,
  reason: string,
  confirmNote: string,
) {
  const lines = c.related.map((r) =>
    `${r.status === "up" ? "✅" : "❌"} ${r.host}${r.is_failed ? " (afetada)" : ""} — ${r.status === "up" ? "online" : "offline"}`,
  );
  const conclusion =
    c.verdict === "server_down"
      ? "Conclusão: possível indisponibilidade do servidor inteiro."
      : c.verdict === "partial"
        ? "Conclusão: instabilidade parcial — parte das conexões falhando."
        : "Conclusão: possível falha isolada nesta DNS. Servidor continua ativo.";

  return (
    `🚨 Diagnóstico inteligente\n\n` +
    `Servidor: ${c.groupKey}\n` +
    `DNS afetada: ${server.host}\n` +
    `Status: Offline${confirmNote ? ` (${confirmNote})` : ""}\n` +
    `Motivo: ${reason}\n\n` +
    `Classificação: ${c.headline}\n` +
    `Confiança do alerta: ${c.confidence}%\n` +
    `DNS vinculadas: ${c.total} · online ${c.online} · offline ${c.offline}\n\n` +
    `Análise:\n${lines.join("\n")}\n\n` +
    `${conclusion}`
  );
}
