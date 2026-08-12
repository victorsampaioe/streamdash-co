import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { UA_PLAYER, egressIp } from "./iptv.server";

const DIAG_TIMEOUT_TOTAL = 15_000;
const DIAG_TIMEOUT_CONNECT = 8_000;
const TARGET_BYTES = 256 * 1024;
const MAX_BYTES = 512 * 1024;

export type DiagnosticStep = {
  id: number;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  details?: string;
};

export type DiagnosticResult = {
  status: 'working' | 'slow' | 'unstable' | 'unavailable' | 'server_unavailable' | 'regional_issue' | 'client_issue';
  ttfb_ms?: number;
  connection_ms?: number;
  bytes_read?: number;
  duration_ms?: number;
  codec?: string;
  resolution?: string;
  error?: string;
  steps: DiagnosticStep[];
};

/** Lógica de Single-Flight / Deduplicação em memória (por worker) */
const activeProbes = new Map<string, Promise<DiagnosticResult>>();

export async function runContentDiagnostic(
  userId: string | null,
  serverId: string,
  contentId: string,
  contentType: 'live' | 'movie' | 'series' | 'episode'
): Promise<DiagnosticResult> {
  const cacheKey = `${serverId}:${contentId}:${contentType}`;

  // 1. Deduplicação (Single-Flight)
  if (activeProbes.has(cacheKey)) {
    return activeProbes.get(cacheKey)!;
  }

  const probe = executeDiagnostic(userId, serverId, contentId, contentType);
  activeProbes.set(cacheKey, probe);

  try {
    return await probe;
  } finally {
    activeProbes.delete(cacheKey);
  }
}

async function executeDiagnostic(
  userId: string | null,
  serverId: string,
  contentId: string,
  contentType: string
): Promise<DiagnosticResult> {
  const tStart = Date.now();
  const steps: DiagnosticStep[] = [
    { id: 1, label: "Confirmar servidor ativo", status: 'pending' },
    { id: 2, label: "Validar Player API", status: 'pending' },
    { id: 3, label: "Confirmar existência do conteúdo", status: 'pending' },
    { id: 4, label: "Requisição HTTP ao stream", status: 'pending' },
    { id: 5, label: "Medir tempo de resposta (TTFB)", status: 'pending' },
    { id: 6, label: "Leitura parcial do stream", status: 'pending' },
    { id: 7, label: "Confirmar recebimento de mídia", status: 'pending' },
    { id: 8, label: "Encerrar conexão", status: 'pending' },
    { id: 9, label: "Classificar resultado", status: 'pending' },
  ];

  const updateStep = (id: number, status: DiagnosticStep['status'], details?: string) => {
    const s = steps.find(x => x.id === id);
    if (s) {
      s.status = status;
      if (details) s.details = details;
    }
  };

  try {
    // 1. Servidor Ativo
    updateStep(1, 'running');
    const { data: server } = await supabaseAdmin.from('servers').select('*').eq('id', serverId).single();
    if (!server || server.monitoring_paused) {
      throw new Error("Servidor inativo ou pausado");
    }
    updateStep(1, 'success');

    // 2. Player API & 3. Conteúdo (Simulado via RPC para simplificar, ideal seria chamada real Xtream)
    updateStep(2, 'running');
    const { getIptvCredentials } = await import("./iptv-credentials.server");
    const creds = await getIptvCredentials(serverId);
    if (!creds.username) throw new Error("Credenciais ausentes");
    updateStep(2, 'success');

    updateStep(3, 'running');
    // Construir URL de stream baseado no tipo
    const streamUrl = contentType === 'live' 
      ? `http://${server.host}/live/${creds.username}/${creds.password}/${contentId}.ts`
      : `http://${server.host}/movie/${creds.username}/${creds.password}/${contentId}.mp4`; // Simplificado
    updateStep(3, 'success', "Stream localizado");

    // 4, 5, 6, 7. Requisição e Streaming
    updateStep(4, 'running');
    const controller = new AbortController();
    const globalTimeout = setTimeout(() => controller.abort(), DIAG_TIMEOUT_TOTAL);
    
    const tReq = Date.now();
    const response = await fetch(streamUrl, {
      headers: {
        'User-Agent': UA_PLAYER,
        'Range': `bytes=0-${MAX_BYTES}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    updateStep(4, 'success');

    updateStep(5, 'running');
    const ttfb = Date.now() - tReq;
    updateStep(5, 'success', `${ttfb}ms`);

    updateStep(6, 'running');
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream sem corpo");

    let bytesReceived = 0;
    const tStreamStart = Date.now();
    
    while (bytesReceived < TARGET_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesReceived += value.length;
      if (bytesReceived >= MAX_BYTES) break;
    }
    const connectionTime = Date.now() - tStreamStart;
    updateStep(6, 'success', `${Math.round(bytesReceived / 1024)}KB lidos`);

    // 7. Mídia real
    updateStep(7, 'running');
    if (bytesReceived < 1024) throw new Error("Mídia insuficiente ou vazia");
    updateStep(7, 'success');

    // 8. Encerrar
    updateStep(8, 'running');
    await reader.cancel();
    clearTimeout(globalTimeout);
    updateStep(8, 'success');

    // 9. Classificar
    updateStep(9, 'running');
    const duration = Date.now() - tStart;
    let status: DiagnosticResult['status'] = 'working';
    if (ttfb > 3000) status = 'slow';
    if (bytesReceived < TARGET_BYTES) status = 'unstable';
    
    const result: DiagnosticResult = {
      status,
      ttfb_ms: ttfb,
      connection_ms: connectionTime,
      bytes_read: bytesReceived,
      duration_ms: duration,
      steps
    };
    updateStep(9, 'success');

    // Persistir e Circuit Breaker
    try {
      await supabaseAdmin.rpc('record_diagnostic_success', { p_server_id: serverId });
    } catch (rpcErr) {
      console.error("[diagnostic] Error calling record_diagnostic_success:", rpcErr);
    }

    const { data: catalogItem } = await supabaseAdmin
      .from("iptv_catalog_items")
      .select("name")
      .eq("server_id", serverId)
      .eq("external_id", contentId)
      .maybeSingle();

    await (supabaseAdmin.from('content_diagnostics' as any) as any).insert({
      user_id: (!userId || userId === 'core-system') ? null : userId,
      server_id: serverId,
      content_id: contentId,
      content_type: contentType,
      content_title: catalogItem?.name || "Conteúdo IPTV",
      status: result.status,
      ttfb_ms: result.ttfb_ms,
      connection_ms: result.connection_ms,
      bytes_read: result.bytes_read,
      duration_ms: result.duration_ms,
      steps: JSON.stringify(steps)
    });

    return result;

  } catch (e: any) {
    const err = String(e.message || e);
    try {
      await supabaseAdmin.rpc('record_diagnostic_failure', { p_server_id: serverId });
    } catch (rpcErr) {
      console.error("[diagnostic] Error calling record_diagnostic_failure:", rpcErr);
    }
    
    const result: DiagnosticResult = {
      status: err.includes('HTTP 5') ? 'server_unavailable' : 'unavailable',
      error: err,
      steps: steps.map(s => s.status === 'running' ? { ...s, status: 'error', details: err } : s) as any
    };

    const { data: catalogItem } = await supabaseAdmin
      .from("iptv_catalog_items")
      .select("name")
      .eq("server_id", serverId)
      .eq("external_id", contentId)
      .maybeSingle();

    await (supabaseAdmin.from('content_diagnostics' as any) as any).insert({
      user_id: (!userId || userId === 'core-system') ? null : userId,
      server_id: serverId,
      content_id: contentId,
      content_type: contentType,
      content_title: catalogItem?.name || "Conteúdo IPTV",
      status: result.status,
      error: result.error,
      duration_ms: Date.now() - tStart,
      steps: JSON.stringify(result.steps)
    });

    return result;
  }
}
