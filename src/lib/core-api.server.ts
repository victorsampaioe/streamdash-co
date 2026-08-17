
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

/**
 * Tarefas que o Core AWS (worker stateless, sem banco) consegue executar.
 * Qualquer outra tarefa depende do banco e é do Painel — delegá-la ao worker
 * resulta em HTTP 501 ("exige acesso ao banco e não roda no worker").
 */
export const WORKER_CAPABLE_TASKS: ReadonlySet<CoreTask> = new Set<CoreTask>([
  "probe-http",
  "probe-dns",
  "probe-iptv-login",
  "iptv-detect",
  "iptv-validate",
  "iptv-ua-test",
]);

export function canRunOnCore(task: CoreTask): boolean {
  return WORKER_CAPABLE_TASKS.has(task);
}

export function useCore(task?: CoreTask): boolean {
  if (!coreApiUrl() || isCoreInstance()) return false;
  if (task && !canRunOnCore(task)) return false;
  return true;
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

/**
 * Fila de concorrência: evita disparar centenas de tarefas simultâneas
 * contra o Core (causa raiz de timeouts em cascata).
 */
const MAX_CONCURRENT = Number(process.env.CORE_MAX_CONCURRENT ?? 8);
let inFlight = 0;
const waiting: Array<() => void> = [];

export function coreQueueStats() {
  return { inFlight, queued: waiting.length, maxConcurrent: MAX_CONCURRENT };
}

async function acquireSlot(): Promise<() => void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
  } else {
    await new Promise<void>((resolve) => waiting.push(resolve));
    inFlight++;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight--;
    const next = waiting.shift();
    if (next) next();
  };
}

/** Remove credenciais do payload antes de gravar na auditoria. */
function sanitizePayload(payload: Record<string, unknown>) {
  const clone: Record<string, unknown> = { ...payload };
  if ("password" in clone) clone["password"] = clone["password"] ? "***presente***" : null;
  return clone;
}

/** Executa uma tarefa de monitoramento no Core AWS com auditoria. */
export async function callCore<T>(task: CoreTask, payload: Record<string, unknown> = {}): Promise<T> {
  const base = coreApiUrl();
  if (!base) throw new Error("CORE_API_URL não configurada");

  // O Core é um worker stateless: a maioria das tarefas depende do banco e roda no Painel.
  // Somente tarefas permitidas (canRunOnCore) são delegadas ao worker, exceto se forçado
  // para tasks específicas que o worker suporta via proxy (iptv-player-proxy).
  const isProxy = task === "iptv-player-proxy";
  if (!isProxy && !canRunOnCore(task)) {
    throw new Error(
      `Tarefa "${task}" depende do banco e roda no Painel — não é delegável ao Core worker.`,
    );
  }

  const endpoint = `${base}/api/public/core/task`;
  const isBatch = task === "iptv-batch-sync";
  const controller = new AbortController();
  const timeoutMs = isBatch ? 120_000 : 30_000;

  const queuedAt = Date.now();
  const release = await acquireSlot();
  const queueWaitMs = Date.now() - queuedAt;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  console.log(
    `[core-task] ▶ início task=${task} fila=${queueWaitMs}ms emExecucao=${inFlight}/${MAX_CONCURRENT} aguardando=${waiting.length} timeout=${timeoutMs}ms`,
  );

  const safePayload = sanitizePayload(payload);

  const logId = await logCoreExecution({
    task_type: task,
    endpoint,
    request_payload: { ...safePayload, _queueWaitMs: queueWaitMs },
    status: "running"
  });


  const start = Date.now();
  const secret = process.env.CRON_SECRET ?? "";

  console.log(
    `[CORE REQUEST] task: ${task} | host: ${payload.host || "N/A"} | username: ${payload.username ? "presente" : "ausente"} | password: ${payload.password ? "presente" : "ausente"} | secret: ${secret ? "presente" : "ausente"} | timestamp: ${new Date().toISOString()}`,
  );


  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": secret,
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
          request_payload: safePayload,
          status: "failed",
          response_status: res.status,
          response_data: json || { raw: text.slice(0, 1000) },
          execution_time_ms: elapsed,
          error_message: `HTTP ${res.status}`
        });
      }
      console.error(`[core-task] ✖ fim task=${task} status=HTTP_${res.status} duracao=${elapsed}ms`);
      throw new Error(`Core ${task} falhou (${res.status}): ${text}`);
    }

    if (logId) {
      await logCoreExecution({
        id: logId,
        task_type: task,
        endpoint,
        request_payload: safePayload,
        status: "success",
        response_status: res.status,
        response_data: json,
        execution_time_ms: elapsed
      });
    }

    console.log(`[CORE RESPONSE] status: ${res.status} | result: up/down | task: ${task} | duracao: ${elapsed}ms`);
    console.log(`[core-task] ✔ fim task=${task} status=ok duracao=${elapsed}ms fila=${waiting.length}`);

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
        request_payload: safePayload,
        status: isTimeout ? "timeout" : "failed",
        execution_time_ms: elapsed,
        error_message: e.message
      });
    }
    console.error(
      `[core-task] ✖ fim task=${task} status=${isTimeout ? "timeout" : "erro"} duracao=${elapsed}ms erro=${e?.message}`,
    );
    throw e;
  } finally {
    clearTimeout(timeout);
    release();
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
  force = false,
): Promise<T> {
  if (!force && !useCore(task)) {
    if (coreApiUrl() && !isCoreInstance() && !canRunOnCore(task)) {
      console.log(
        `[CORE SKIP] task: ${task} | motivo: tarefa depende do banco (Painel é dono do banco) | timestamp: ${new Date().toISOString()}`,
      );
    }
    return await local();
  }
  try {
    // Se force=true, tentamos o callCore mesmo que useCore(task) retorne false
    // (ex: forçar detalhes de séries pelo Core AWS para bypassar WAF do painel)
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


