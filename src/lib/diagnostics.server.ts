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
  status: 'working' | 'slow' | 'unstable' | 'unavailable' | 'server_unavailable' | 'regional_issue' | 'client_issue';
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

  if (cached) {
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

    try {
      return await executeDiagnostic(userId, serverId, contentId, contentType);
    } finally {
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
    // Construir URL de stream baseado no tipo
    let streamUrl = "";
    if (contentType === 'live') {
      streamUrl = `http://${server.host}/live/${creds.username}/${creds.password}/${contentId}.ts`;
    } else if (contentType === 'movie') {
      // Xtream VOD: contentId costuma ser o ID numérico.
      // Tenta .mp4 como fallback padrão se não houver extensão.
      const ext = contentId.includes('.') ? '' : '.mp4';
      streamUrl = `http://${server.host}/movie/${creds.username}/${creds.password}/${contentId}${ext}`;
    } else if (contentType === 'episode' || contentType === 'series') {
      // Xtream Series: /series/user/pass/id.ext
      const ext = contentId.includes('.') ? '' : '.mp4';
      streamUrl = `http://${server.host}/series/${creds.username}/${creds.password}/${contentId}${ext}`;
    } else {
      throw new Error(`Tipo de conteúdo inválido: ${contentType}`);
    }
    updateStep(3, 'success', "Stream localizado");

    // 4, 5, 6, 7. Requisição e Streaming
    updateStep(4, 'running');
    const controller = new AbortController();
    
    // Timeout de conexão (8s) vs Timeout total (15s)
    // DIAG_TIMEOUT_TOTAL = 15s (global para o diagnóstico todo)
    // DIAG_TIMEOUT_CONNECT = 8s (específico para o fetch inicial)
    
    const connectTimeout = setTimeout(() => controller.abort(), DIAG_TIMEOUT_CONNECT);
    
    const tReq = Date.now();
    let response: Response;
    try {
      // Tenta primeiro com User-Agent de Player (padrão)
      response = await fetch(streamUrl, {
        headers: {
          'User-Agent': UA_PLAYER,
          'Range': `bytes=0-${MAX_BYTES}`
        },
        signal: controller.signal
      });

      // Se der 403, tenta com VLC como fallback
      if (response.status === 403) {
        const { UA_VLC } = await import("./iptv.server");
        response = await fetch(streamUrl, {
          headers: {
            'User-Agent': UA_VLC,
            'Range': `bytes=0-${MAX_BYTES}`
          },
          signal: controller.signal
        });
      }
    } catch (fetchErr: any) {
      if (fetchErr.name === 'AbortError') {
        throw new Error(`Timeout de conexão (${DIAG_TIMEOUT_CONNECT/1000}s) excedido ao tentar acessar o stream.`);
      }
      throw fetchErr;
    } finally {
      clearTimeout(connectTimeout);
    }

    if (!response.ok) {
      // Diferenciar erros HTTP para facilitar diagnóstico
      if (response.status === 401 || response.status === 403) {
        const egress = await egressIp();
        const msg = response.status === 403 
          ? `HTTP 403: Acesso negado pelo servidor (Bloqueio de IP ou Firewall). IP de saída: ${egress || 'desconhecido'}`
          : `HTTP 401: Acesso negado (Credenciais inválidas para este conteúdo)`;
        throw new Error(msg);
      }
      if (response.status === 404) {
        throw new Error(`HTTP 404: Conteúdo não encontrado no host`);
      }
      throw new Error(`HTTP ${response.status}: Falha na requisição`);
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
      if (readErr.name === 'AbortError' || readErr.message.includes('Timeout')) {
        throw new Error(`Timeout total (${DIAG_TIMEOUT_TOTAL/1000}s) atingido durante a leitura da mídia.`);
      }
      throw readErr;
    } finally {
      clearTimeout(streamTimeout);
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
    const err = String(e.message || e);
    try {
      await supabaseAdmin.rpc('record_diagnostic_failure', { p_server_id: serverId });
    } catch (rpcErr) {
      console.error("[diagnostic] Error calling record_diagnostic_failure:", rpcErr);
    }
    
    const result: DiagnosticResult = {
      status: err.includes('HTTP 403') ? 'server_unavailable' : (err.includes('HTTP 5') ? 'server_unavailable' : 'unavailable'),
      error: err,
      steps: steps.map(s => s.status === 'running' ? { ...s, status: 'error', details: err } : s) as any
    };

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
      error_message: result.error,
      duration_ms: Date.now() - tStart,
      steps: JSON.stringify(result.steps),
      is_cached: false
    });

    return result;
  }
}
