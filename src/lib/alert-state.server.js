// Agrupamento e deduplicação de alertas IPTV por servidor.
// - Um único envio consolidado por execução (todos os problemas na mesma mensagem).
// - Confirmação antes de avisar (ex.: Player API lenta e Streams de amostra).
// - Enquanto o incidente continuar ativo, nenhuma mensagem repetida é enviada.
//   Só volta a avisar depois que o incidente for resolvido e ocorrer novamente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
/**
 * Processa todos os candidatos de alerta de um servidor de uma só vez.
 * Retorna quantos alertas foram efetivamente notificados.
 */
export async function dispatchAlerts(serverId, candidates, 
/** Tipos de alerta que esta execução avalia — só eles podem ser resolvidos. */
manages) {
    const nowIso = new Date().toISOString();
    const stateful = candidates.filter((c) => !c.transient);
    const transient = candidates.filter((c) => c.transient);
    const { data: rows } = await supabaseAdmin
        .from("iptv_alert_state")
        .select("kind, active, pending_count, first_seen_at")
        .eq("server_id", serverId);
    const byKind = new Map((rows ?? []).map((r) => [r.kind, r]));
    const toNotify = [...transient];
    const detectedKinds = new Set(stateful.map((c) => c.kind));
    for (const c of stateful) {
        const prev = byKind.get(c.kind);
        const needed = Math.max(1, c.confirmations ?? 1);
        const alreadyActive = prev?.active === true;
        const pending = (prev?.pending_count ?? 0) + 1;
        const confirmed = pending >= needed;
        await supabaseAdmin.from("iptv_alert_state").upsert({
            server_id: serverId,
            kind: c.kind,
            active: alreadyActive || confirmed,
            pending_count: pending,
            first_seen_at: prev?.first_seen_at ?? nowIso,
            last_seen_at: nowIso,
            resolved_at: null,
            ...(!alreadyActive && confirmed ? { notified_at: nowIso } : {}),
        }, { onConflict: "server_id,kind" });
        // Só notifica na transição para ativo (incidente novo).
        if (!alreadyActive && confirmed)
            toNotify.push(c);
    }
    // Resolve incidentes que não foram detectados nesta execução.
    const scope = manages ? new Set(manages) : null;
    const resolvedKinds = (rows ?? [])
        .filter((r) => (r.active || r.pending_count > 0) && !detectedKinds.has(r.kind))
        .filter((r) => !scope || scope.has(r.kind))
        .map((r) => r.kind);
    if (resolvedKinds.length) {
        await supabaseAdmin
            .from("iptv_alert_state")
            .update({ active: false, pending_count: 0, resolved_at: nowIso })
            .eq("server_id", serverId)
            .in("kind", resolvedKinds);
    }
    if (!toNotify.length)
        return { notified: 0, resolved: resolvedKinds.length };
    // Histórico continua individual (usado no painel).
    await supabaseAdmin.from("iptv_alerts").insert(toNotify.map((c) => ({
        server_id: serverId,
        kind: c.kind,
        severity: c.severity,
        title: c.title,
        detail: c.detail ?? null,
    })));
    // Uma única mensagem consolidada por servidor.
    try {
        const { notifyServerIptvAlerts } = await import("./iptv-notify.server");
        await notifyServerIptvAlerts(serverId, toNotify.map((c) => ({ title: c.title, detail: c.detail ?? "", severity: c.severity })));
    }
    catch {
        /* notificação é best-effort */
    }
    return { notified: toNotify.length, resolved: resolvedKinds.length };
}
