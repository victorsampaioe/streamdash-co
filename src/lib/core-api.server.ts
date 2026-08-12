/**
 * Ponte com o Core AWS (https://core.streammonitor.site).
 *
 * O painel Lovable é apenas frontend: todas as verificações pesadas
 * (DNS, HTTP, IPTV, conteúdos, alertas Telegram e o scheduler) são
 * executadas pelo Core hospedado na VPS AWS, que usa o IP próprio da EC2.
 *
 * Quando a variável não está configurada — ou quando o próprio Core está
 * executando este código — a execução acontece localmente (fallback).
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
  | "get-series-seasons"

  | "telegram-broadcast"
  | "cron-check"
  | "cron-digest";


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

/** Executa uma tarefa de monitoramento no Core AWS. */
export async function callCore<T>(task: CoreTask, payload: Record<string, unknown> = {}): Promise<T> {
  const base = coreApiUrl();
  if (!base) throw new Error("CORE_API_URL não configurada");
  
  // Timeout estendido para sincronização em lote (2 minutos)
  const isBatch = task === "iptv-batch-sync";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), isBatch ? 120_000 : 30_000);

  try {
    const res = await fetch(`${base}/api/public/core/task`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ task, ...payload }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Core ${task} falhou (${res.status}): ${await res.text()}`);
    return (await res.json()) as T;
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
 *
 * O Core roda a mesma aplicação; quando ele está com um build antigo a rota
 * não existe e o catch-all devolve HTML com status 200 — o que fazia o painel
 * acreditar que a tarefa tinha sido aceita. Aqui isso é tratado como falha.
 */
export async function coreJsonPost<T>(path: string, timeoutMs = 20_000): Promise<T> {
  const base = coreApiUrl();
  if (!base) throw new Error("CORE_API_URL não configurada");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
      signal: controller.signal,
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) throw new Error(`Core ${path} HTTP ${res.status}`);
    if (!ct.includes("application/json")) {
      throw new Error(`Core ${path} respondeu ${ct || "sem content-type"} (rota inexistente no build do Core)`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

