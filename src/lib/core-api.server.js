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
function normalize(url) {
    const raw = (url ?? "").trim();
    if (!raw)
        return null;
    return raw.replace(/\/+$/, "");
}
/** URL do Core AWS (server-side ou inlinada no build). */
export function coreApiUrl() {
    return (normalize(process.env.CORE_API_URL) ??
        normalize(process.env.VITE_CORE_API_URL) ??
        normalize(import.meta.env?.VITE_CORE_API_URL));
}
/** true quando este processo É o Core (evita o Core chamar a si mesmo). */
export function isCoreInstance() {
    if (process.env.IS_CORE === "true")
        return true;
    const base = normalize(process.env.PUBLIC_BASE_URL);
    const core = coreApiUrl();
    return Boolean(base && core && base === core);
}
export function useCore() {
    return Boolean(coreApiUrl()) && !isCoreInstance();
}
/** Executa uma tarefa de monitoramento no Core AWS. */
export async function callCore(task, payload = {}) {
    const base = coreApiUrl();
    if (!base)
        throw new Error("CORE_API_URL não configurada");
    // Timeout estendido para sincronização em lote (2 minutos)
    const isBatch = task === "iptv-batch-sync";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isBatch ? 120000 : 30000);
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
        if (!res.ok)
            throw new Error(`Core ${task} falhou (${res.status}): ${await res.text()}`);
        return (await res.json());
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Roda a tarefa no Core AWS; se o Core estiver indisponível, executa local
 * para o painel nunca ficar sem resposta.
 */
export async function runOnCore(task, payload, local) {
    if (!useCore())
        return await local();
    try {
        return await callCore(task, payload);
    }
    catch (e) {
        console.warn(`[core-api] fallback local para "${task}":`, e?.message);
        return await local();
    }
}
