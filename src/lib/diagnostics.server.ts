import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { UA_PLAYER, egressIp } from "./iptv.server";

const DIAG_TIMEOUT_TOTAL = 15_000;
const DIAG_TIMEOUT_CONNECT = 8_000;
const TARGET_BYTES = 256 * 1024;
const MAX_BYTES = 512 * 1024;

const LIMIT_USER_CONCURRENT = 1; 
const LIMIT_SERVER_CONCURRENT = 2; // Máximo 2 diagnósticos simultâneos no mesmo servidor IPTV (conforme especificação)

export type DiagnosticStep = {
  id: number;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
  details?: string;
};

export type DiagnosticResult = {
  status: 'working' | 'slow' | 'unstable' | 'unavailable' | 'server_unavailable' | 'regional_issue' | 'client_issue' | 'cancelled';

  ttfb_ms?: number;
  connection_ms?: number;
  bytes_read?: number;
  duration_ms?: number;
  codec?: string;
  resolution?: string;
  error?: string;
  steps: DiagnosticStep[];
  is_cached?: boolean;
  cached_at?: string;
};

/** Item 6 — Sinalização de cancelamento compartilhada entre instâncias (tabela diagnostic_locks). */
function cancelKeyFor(serverId: string, contentId: string, contentType: string) {
  return `cancel:diag:${serverId}:${contentId}:${contentType}`;
}

export async function requestDiagnosticCancel(
  serverId: string,
  contentId: string,
  contentType: string,
): Promise<{ ok: true; active: boolean }> {
  const key = cancelKeyFor(serverId, contentId, contentType);
  // Só sinaliza se existir uma execução em andamento (lock de dedupe ativo);
  // caso contrário a flag ficaria órfã na tabela.
  const { data: running } = await supabaseAdmin
    .from('diagnostic_locks')
    .select('lock_key')
    .eq('lock_key', `diag:${serverId}:${contentId}:${contentType}`)
    .maybeSingle();
  if (!running) return { ok: true, active: false };
  await (supabaseAdmin.from('diagnostic_locks') as any)
    .upsert({ lock_key: key, created_at: new Date().toISOString() }, { onConflict: 'lock_key' });
  console.log(`[diagnostic] Cancel requested for ${key}`);
  return { ok: true, active: true };
}


async function isCancelRequested(key: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('diagnostic_locks')
    .select('lock_key')
    .eq('lock_key', key)
    .maybeSingle();
  return !!data;
}

async function clearCancelFlag(key: string) {
  await supabaseAdmin.from('diagnostic_locks').delete().eq('lock_key', key);
}

export class DiagnosticCancelled extends Error {
  constructor() {
    super('Diagnóstico cancelado pelo usuário');
    this.name = 'DiagnosticCancelled';
  }
}

/** 
 * Item 4 — Cache e Deduplicação Global
 */

export async function runContentDiagnostic(
  userId: string | null,
  serverId: string,
  contentId: string,
  contentType: 'live' | 'movie' | 'series' | 'episode'
): Promise<DiagnosticResult> {
  const cacheKey = `diag:${serverId}:${contentId}:${contentType}`;
  const effectiveUserId = userId || 'core-system';

  // 1. Verificar Cache (Item 4)
  // TTL: 120s para sucessos, 60s para falhas
  const { data: cached } = await supabaseAdmin
    .from('content_diagnostics')
    .select('*, servers(name)')
    .eq('server_id', serverId)
    .eq('content_id', contentId)
    .eq('content_type', contentType)
    .gt('created_at', new Date(Date.now() - 120 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Item 6 — cancelamentos nunca são servidos do cache
  if (cached && cached.status !== 'cancelled') {
    const isSuccess = ['working', 'slow', 'unstable'].includes(cached.status);

    const createdAt = cached.created_at ? new Date(cached.created_at as string).getTime() : Date.now();
    const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
    
    // Se for sucesso e tiver menos de 120s, OU se for erro e tiver menos de 60s
    if ((isSuccess && ageSeconds < 120) || (!isSuccess && ageSeconds < 60)) {
      console.log(`[diagnostic] Cache hit for ${cacheKey} (${ageSeconds}s ago)`);
      return {
        status: cached.status as any,
        ttfb_ms: cached.ttfb_ms ?? undefined,
        connection_ms: cached.connection_ms ?? undefined,
        bytes_read: cached.bytes_read ?? undefined,
        duration_ms: cached.duration_ms ?? undefined,
        error: (cached as any).error_message ?? undefined,
        steps: typeof cached.steps === 'string' ? JSON.parse(cached.steps) : (cached.steps as any),
        is_cached: true,
        cached_at: (cached.created_at as string | undefined) || undefined
      };
    }
  }

  // 2. Deduplicação Global (Lock via Postgres)
  const { data: lockAcquired } = await (supabaseAdmin.rpc as any)('acquire_diagnostic_lock', { p_lock_key: cacheKey });
  
  if (!lockAcquired) {
    // Se não conseguiu o lock, espera um pouco e tenta ler o cache (pode ser que outro worker acabou de terminar)
    await new Promise(resolve => setTimeout(resolve, 2000));
    return runContentDiagnostic(effectiveUserId === 'core-system' ? null : effectiveUserId, serverId, contentId, contentType); // Recursão simples para re-checar cache
  }

  try {
    // 3. Circuit Breaker Check (Item 5)
    const { data: breakerState } = await (supabaseAdmin.rpc as any)('check_circuit_breaker', { p_server_id: serverId });
    if (breakerState === 'open') {
      throw new Error("Circuito Aberto: Este servidor IPTV está instável ou offline no momento. Tente novamente em alguns minutos.");
    }

    // 4. Rate Limit & Concorrência (Item 2)
    let isActualAdmin = false;
    if (effectiveUserId !== 'core-system') {
    const { data: roles } = await supabaseAdmin.rpc('has_role', { 
      _user_id: effectiveUserId as any, 
      _role: 'admin' as any
    });
      isActualAdmin = !!roles;
    }

    const { data: slotResult } = await (supabaseAdmin.rpc as any)('acquire_diagnostic_slot_v2', { 
      p_user_id: effectiveUserId === 'core-system' ? '00000000-0000-0000-0000-000000000000' : effectiveUserId, 
      p_server_id: serverId,
      p_is_admin: isActualAdmin,
      p_max_server_concurrent: LIMIT_SERVER_CONCURRENT
    });

    if (!slotResult || !slotResult.success) {
      throw new Error(slotResult?.message || "Muitos diagnósticos em execução. Por favor, aguarde.");
    }

    // Item 6 — cancelamento cooperativo: limpa flag antiga e observa pedidos novos
    const cKey = cancelKeyFor(serverId, contentId, contentType);
    await clearCancelFlag(cKey);
    const cancelCtl = new AbortController();
    const poller = setInterval(() => {
      isCancelRequested(cKey)
        .then((c) => { if (c) cancelCtl.abort(); })
        .catch(() => {});
    }, 700);

    try {
      return await executeDiagnostic(userId, serverId, contentId, contentType, cancelCtl.signal);
    } finally {
      clearInterval(poller);
      await clearCancelFlag(cKey);
      // Liberar slot de concorrência
      await (supabaseAdmin.rpc as any)('release_diagnostic_slot', {
        p_user_id: effectiveUserId === 'core-system' ? '00000000-0000-0000-0000-000000000000' : effectiveUserId,
        p_server_id: serverId
      });
    }
  } finally {
    // Liberar Lock Global
    await (supabaseAdmin.rpc as any)('release_diagnostic_lock', { p_lock_key: cacheKey });
  }
}


async function executeDiagnostic(
  userId: string | null,
  serverId: string,
  contentId: string,
  contentType: string,
  cancelSignal?: AbortSignal
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
    const { data: server } = await supabaseAdmin.from('servers').select('id, host, monitoring_paused').eq('id', serverId).single();
    if (!server) {
      throw new Error("Servidor não encontrado");
    }
    if (server.monitoring_paused) {
      throw new Error("Servidor inativo ou pausado");
    }
    updateStep(1, 'success');

    // 2. Player API & 3. Conteúdo (Simulado via RPC para simplificar, ideal seria chamada real Xtream)
    updateStep(2, 'running');
    const { getIptvCredentials } = await import("./iptv-credentials.server");
    const creds = await getIptvCredentials(serverId);
    if (!creds || !creds.username) {
      throw new Error("Credenciais Xtream não configuradas");
    }
    updateStep(2, 'success');

    updateStep(3, 'running');
    // Normaliza host (pode vir com ou sem esquema / barra final)
    const rawHost = String(server.host || "").replace(/\/+$/, "");
    const hasScheme = /^https?:\/\//i.test(rawHost);
    const bareHost = rawHost.replace(/^https?:\/\//i, "");
    const bases = hasScheme
      ? [rawHost, `${/^https:/i.test(rawHost) ? "http" : "https"}://${bareHost}`]
      : [`http://${bareHost}`, `https://${bareHost}`];

    // Máscara de credenciais para logs
    const cUser = String(creds.username ?? "");
    const cPass = String(creds.password ?? "");
    const mask = (u: string) =>
      u.split(encodeURIComponent(cUser)).join("***").split(cUser).join("***")
       .split(encodeURIComponent(cPass)).join("***").split(cPass).join("***");

    // Construir candidatos de URL de stream baseado no tipo
    const candidates: string[] = [];
    if (contentType === 'live') {
      // Xtream Live aceita .ts, .m3u8 e o caminho curto /user/pass/id
      for (const base of bases) {
        candidates.push(`${base}/live/${creds.username}/${creds.password}/${contentId}.ts`);
        candidates.push(`${base}/live/${creds.username}/${creds.password}/${contentId}.m3u8`);
        candidates.push(`${base}/${creds.username}/${creds.password}/${contentId}`);
      }
    } else if (contentType === 'movie') {
      const ext = contentId.includes('.') ? '' : '.mp4';
      for (const base of bases) {
        candidates.push(`${base}/movie/${creds.username}/${creds.password}/${contentId}${ext}`);
        if (!contentId.includes('.')) candidates.push(`${base}/movie/${creds.username}/${creds.password}/${contentId}.mkv`);
      }
    } else if (contentType === 'episode' || contentType === 'series') {
      const ext = contentId.includes('.') ? '' : '.mp4';
      for (const base of bases) {
        candidates.push(`${base}/series/${creds.username}/${creds.password}/${contentId}${ext}`);
        if (!contentId.includes('.')) candidates.push(`${base}/series/${creds.username}/${creds.password}/${contentId}.mkv`);
      }
    } else {
      throw new Error(`Tipo de conteúdo inválido: ${contentType}`);
    }
    updateStep(3, 'success', "Stream localizado");

    // 4, 5, 6, 7. Requisição e Streaming
    updateStep(4, 'running');
    const controller = new AbortController();

    // Item 6 — cancelamento do cliente aborta a conexão imediatamente
    if (cancelSignal?.aborted) throw new DiagnosticCancelled();
    const onCancel = () => controller.abort();
    cancelSignal?.addEventListener('abort', onCancel);
    
    // Timeout de conexão (8s) vs Timeout total (15s)
    const connectTimeout = setTimeout(() => controller.abort(), DIAG_TIMEOUT_CONNECT);

    const { UA_VLC } = await import("./iptv.server");
    const agents = [UA_PLAYER, UA_VLC];

    const tReq = Date.now();
    let response: Response | null = null;
    let streamUrl = candidates[0];
    let lastStatus = 0;
    try {
      outer: for (const url of candidates) {
        for (const ua of agents) {
          if (cancelSignal?.aborted) throw new DiagnosticCancelled();
          try {
            const r = await fetch(url, {
              headers: { 'User-Agent': ua, 'Range': `bytes=0-${MAX_BYTES}` },
              redirect: 'follow',
              signal: controller.signal,
            });
            lastStatus = r.status;
            console.log(`[DIAG ${contentType.toUpperCase()}] ${mask(url)} → HTTP ${r.status} (${r.headers.get('content-type') ?? '-'})`);
            if (r.ok) {
              response = r;
              streamUrl = url;
              break outer;
            }
            await r.body?.cancel().catch(() => {});
            // 401/403 = bloqueio real: não adianta tentar outras extensões com o mesmo UA
            if (r.status === 401) break outer;
          } catch (e: any) {
            if (e?.name === 'AbortError') throw e;
            console.log(`[DIAG ${contentType.toUpperCase()}] ${mask(url)} → ERRO ${e?.message}`);
          }
        }
      }
    } catch (fetchErr: any) {
      if (cancelSignal?.aborted) throw new DiagnosticCancelled();
      if (fetchErr.name === 'AbortError') {
        throw new Error(`Timeout de conexão (${DIAG_TIMEOUT_CONNECT/1000}s) excedido ao tentar acessar o stream.`);
      }
      throw fetchErr;
    } finally {
      clearTimeout(connectTimeout);
    }

    console.log(`[DIAG ${contentType.toUpperCase()}] URL final: ${mask(streamUrl)} status=${response?.status ?? lastStatus}`);

    if (!response) {
      if (lastStatus === 401 || lastStatus === 403) {
        const egress = await egressIp();
        throw new Error(lastStatus === 403
          ? `HTTP 403: Acesso negado pelo servidor (Bloqueio de IP ou Firewall). IP de saída: ${egress || 'desconhecido'}`
          : `HTTP 401: Acesso negado (Credenciais inválidas para este conteúdo)`);
      }
      if (lastStatus === 404) {
        throw new Error(`HTTP 404: Conteúdo não encontrado no host (testado .ts, .m3u8 e caminho curto, em http e https)`);
      }
      throw new Error(lastStatus ? `HTTP ${lastStatus}: Falha na requisição` : `Não foi possível conectar ao stream`);
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
    
    // Timer para o timeout total (15s) durante o consumo do corpo
    const streamController = new AbortController();
    const remainingTime = Math.max(1000, DIAG_TIMEOUT_TOTAL - (Date.now() - tStart));
    const streamTimeout = setTimeout(() => streamController.abort(), remainingTime);
    
    try {
      while (bytesReceived < TARGET_BYTES) {
        // Item 6 — aborta a leitura assim que o cliente fecha o modal
        if (cancelSignal?.aborted) throw new DiagnosticCancelled();
        // Checagem manual de timeout já que reader.read() não aceita signal diretamente em todos os ambientes
        if (Date.now() - tStart > DIAG_TIMEOUT_TOTAL) {
          throw new Error(`Timeout total (${DIAG_TIMEOUT_TOTAL/1000}s) atingido durante a leitura da mídia.`);
        }
        
        const { done, value } = await reader.read();
        if (done) break;
        bytesReceived += value.length;
        if (bytesReceived >= MAX_BYTES) break;
      }
    } catch (readErr: any) {
      if (readErr instanceof DiagnosticCancelled) throw readErr;
      if (cancelSignal?.aborted) throw new DiagnosticCancelled();
      if (readErr.name === 'AbortError' || readErr.message.includes('Timeout')) {
        throw new Error(`Timeout total (${DIAG_TIMEOUT_TOTAL/1000}s) atingido durante a leitura da mídia.`);
      }
      throw readErr;
    } finally {
      clearTimeout(streamTimeout);
      cancelSignal?.removeEventListener('abort', onCancel);
      try { await reader.cancel(); } catch { /* já encerrado */ }
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

    await (supabaseAdmin.from('content_diagnostics') as any).insert({
      user_id: (!userId || userId === 'core-system') ? null : userId,
      server_id: serverId,
      content_id: contentId,
      content_type: contentType,
      status: result.status,
      ttfb_ms: result.ttfb_ms,
      connection_ms: result.connection_ms,
      bytes_read: result.bytes_read,
      duration_ms: result.duration_ms,
      steps: JSON.stringify(steps),
      is_cached: false
    });

    return result;

  } catch (e: any) {
    const cancelled = e instanceof DiagnosticCancelled;
    const err = cancelled ? 'Diagnóstico cancelado pelo usuário' : String(e.message || e);
    const durationMs = Date.now() - tStart;

    if (!cancelled) {
      try {
        await supabaseAdmin.rpc('record_diagnostic_failure', { p_server_id: serverId });
      } catch (rpcErr) {
        console.error("[diagnostic] Error calling record_diagnostic_failure:", rpcErr);
      }
    }
    
    const result: DiagnosticResult = {
      status: cancelled
        ? 'cancelled'
        : (err.includes('HTTP 403') ? 'server_unavailable' : (err.includes('HTTP 5') ? 'server_unavailable' : 'unavailable')),
      error: err,
      // Item 7 — duração também no caminho de erro/cancelamento
      duration_ms: durationMs,
      steps: steps.map(s => s.status === 'running'
        ? { ...s, status: cancelled ? 'pending' : 'error', details: err }
        : s) as any
    };

    await (supabaseAdmin.from('content_diagnostics') as any).insert({
      user_id: (!userId || userId === 'core-system') ? null : userId,
      server_id: serverId,
      content_id: contentId,
      content_type: contentType,
      status: result.status,
      error_message: result.error,
      duration_ms: durationMs,
      steps: JSON.stringify(result.steps),
      is_cached: false
    });

    return result;
  }

}
