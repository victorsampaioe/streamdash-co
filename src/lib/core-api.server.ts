
/**
 * Ponte com o Core AWS (https://core.streammonitor.site).
 *
 * O painel Lovable é apenas frontend: todas as verificações pesadas
 * (DNS, HTTP, IPTV, conteúdos, alertas Telegram e o scheduler) são
 * executadas pelo Core hospedado na VPS AWS, que usa o IP próprio da EC2.
 */

export type CoreTask =
  | "check"
  | "dns"
  | "iptv-detect"
  | "iptv-validate"
  | "iptv-sync"
  | "iptv-batch-sync"
  | "radar-job-step"
  | "iptv-ua-test"
  | "content-scan"
  | "content-diagnostic"
  | "content-diagnostic-cancel"
  | "iptv-categories"
  | "get-series-seasons"
  | "iptv-player-proxy"
  | "iptv-stream-proxy"
  | "telegram-broadcast"
  | "cron-check"
  | "cron-digest"
  // Sondas stateless executadas pelo worker externo (sem banco)
  | "probe-http"
  | "probe-dns"
  | "probe-iptv-login";

function normalize(url: string | undefined | null): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** URL do Core AWS (server-side ou inlinada no build). */
export function coreApiUrl(): string | null {
  return (
    normalize(process.env.CORE_API_URL) ??
    normalize(process.env.VITE_CORE_API_URL) ??
    normalize(import.meta.env?.VITE_CORE_API_URL as string | undefined)
  );
}

/** true quando este processo É o Core (evita o Core chamar a si mesmo). */
export function isCoreInstance(): boolean {
  if (process.env.IS_CORE === "true") return true;
  const base = normalize(process.env.PUBLIC_BASE_URL);
  const core = coreApiUrl();
  return Boolean(base && core && base === core);
}

export function useCore(): boolean {
  return Boolean(coreApiUrl()) && !isCoreInstance();
}

/** 
 * Cria um registro de auditoria na tabela core_execution_logs.
 * Somente no Painel (process.env.IS_CORE !== "true").
 */
async function logCoreExecution(data: {
  task_type: string;
  endpoint: string;
  request_payload: any;
  status: "running" | "success" | "failed" | "timeout";
  response_status?: number;
  response_data?: any;
  execution_time_ms?: number;
  error_message?: string;
  id?: string;
}) {
  if (process.env.IS_CORE === "true") return null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...payload } = data;
    if (id) {
      await supabaseAdmin
        .from("core_execution_logs")
        .update(payload)
        .eq("id", id);
      return id;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("core_execution_logs")
        .insert(payload)
        .select("id")
        .single();
      if (error) console.error("[core-audit] Error inserting log:", error);
      return inserted?.id;
    }
  } catch (e) {
    console.error("[core-audit] Critical logging failure:", e);
    return null;
  }
}

/** Executa uma tarefa de monitoramento no Core AWS com auditoria. */
export async function callCore<T>(task: CoreTask, payload: Record<string, unknown> = {}): Promise<T> {
  const base = coreApiUrl();
  if (!base) throw new Error("CORE_API_URL não configurada");
  
  const endpoint = `${base}/api/public/core/task`;
  const isBatch = task === "iptv-batch-sync";
  const controller = new AbortController();
  const timeoutMs = isBatch ? 120_000 : 30_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const logId = await logCoreExecution({
    task_type: task,
    endpoint,
    request_payload: payload,
    status: "running"
  });

  const start = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ task, ...payload }),
      signal: controller.signal,
    });

    const elapsed = Date.now() - start;
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok) {
      if (logId) {
        await logCoreExecution({
          id: logId,
          task_type: task,
          endpoint,
          request_payload: payload,
          status: "failed",
          response_status: res.status,
          response_data: json || { raw: text.slice(0, 1000) },
          execution_time_ms: elapsed,
          error_message: `HTTP ${res.status}`
        });
      }
      throw new Error(`Core ${task} falhou (${res.status}): ${text}`);
    }

    if (logId) {
      await logCoreExecution({
        id: logId,
        task_type: task,
        endpoint,
        request_payload: payload,
        status: "success",
        response_status: res.status,
        response_data: json,
        execution_time_ms: elapsed
      });
    }

    // O Core responde { success, result }. Versões antigas devolvem o resultado cru.
    const unwrapped =
      json && typeof json === "object" && "success" in json && "result" in json
        ? (json as any).result
        : json;
    return unwrapped as T;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    const isTimeout = e.name === "AbortError";
    if (logId) {
      await logCoreExecution({
        id: logId,
        task_type: task,
        endpoint,
        request_payload: payload,
        status: isTimeout ? "timeout" : "failed",
        execution_time_ms: elapsed,
        error_message: e.message
      });
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Roda a tarefa no Core AWS; se o Core estiver indisponível, executa local
 * para o painel nunca ficar sem resposta.
 */
export async function runOnCore<T>(
  task: CoreTask,
  payload: Record<string, unknown>,
  local: () => Promise<T>,
): Promise<T> {
  if (!useCore()) return await local();
  try {
    return await callCore<T>(task, payload);
  } catch (e) {
    console.warn(`[core-api] fallback local para "${task}":`, (e as Error)?.message);
    return await local();
  }
}

/**
 * POST em um endpoint do Core exigindo resposta JSON.
 */
export async function coreJsonPost<T>(path: string, timeoutMs = 20_000): Promise<T> {
  const base = coreApiUrl();
  if (!base) throw new Error("CORE_API_URL não configurada");
  
  const endpoint = `${base}${path}`;
  const logId = await logCoreExecution({
    task_type: path.split("/").pop() || "cron",
    endpoint,
    request_payload: {},
    status: "running"
  });

  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      signal: controller.signal,
    });
    
    const elapsed = Date.now() - start;
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    if (!res.ok || !ct.includes("application/json")) {
      const err = !res.ok ? `HTTP ${res.status}` : "Invalid Content-Type";
      if (logId) {
        await logCoreExecution({
          id: logId,
          task_type: path.split("/").pop() || "cron",
          endpoint,
          request_payload: {},
          status: "failed",
          response_status: res.status,
          response_data: json || { raw: text.slice(0, 1000) },
          execution_time_ms: elapsed,
          error_message: err
        });
      }
      throw new Error(`Core ${path} falhou: ${err}`);
    }

    if (logId) {
      await logCoreExecution({
        id: logId,
        task_type: path.split("/").pop() || "cron",
        endpoint,
        request_payload: {},
        status: "success",
        response_status: res.status,
        response_data: json,
        execution_time_ms: elapsed
      });
    }

    return json as T;
  } catch (e: any) {
    const elapsed = Date.now() - start;
    if (logId) {
      await logCoreExecution({
        id: logId,
        task_type: path.split("/").pop() || "cron",
        endpoint,
        request_payload: {},
        status: e.name === "AbortError" ? "timeout" : "failed",
        execution_time_ms: elapsed,
        error_message: e.message
      });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}


