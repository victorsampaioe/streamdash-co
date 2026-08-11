// Envio de alertas IPTV pelos canais do dono do servidor (Telegram/Discord/Webhook/Email).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
/** Compatibilidade: um único alerta. */
export async function notifyServerIptvAlert(serverId, title, detail) {
    return notifyServerIptvAlerts(serverId, [{ title, detail }]);
}
/** Envia UMA mensagem consolidada com todos os problemas detectados no servidor. */
export async function notifyServerIptvAlerts(serverId, items) {
    if (!items.length)
        return;
    const { data: server } = await supabaseAdmin
        .from("servers").select("id, owner_id, name, host, iptv_username, iptv_password").eq("id", serverId).maybeSingle();
    if (!server)
        return;
    const esc = (s) => String(s ?? "-").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    const plainLines = items.map((i) => `• ${i.title}${i.detail ? ` — ${i.detail}` : ""}`);
    const htmlLines = items.map((i) => `• <b>${esc(i.title)}</b>${i.detail ? ` — ${esc(i.detail)}` : ""}`);
    const header = items.length > 1
        ? `📡 ${items.length} problemas detectados`
        : "📡 Alerta do servidor";
    // Cópia sempre para o Telegram do admin
    try {
        const { notifyAdmin } = await import("./admin-telegram.server");
        const { data: prof } = await supabaseAdmin
            .from("profiles").select("full_name, email").eq("id", server.owner_id).maybeSingle();
        await notifyAdmin(`📡 <b>${esc(header)}</b>\n${esc(server.name)}\n${htmlLines.join("\n")}\n` +
            `Revenda: ${esc(prof?.full_name)} — ${esc(prof?.email)}\n` +
            `Host: <code>${esc(server.host)}</code>` +
            (server.iptv_username && server.iptv_password ? "\nIPTV: credenciais ativas ✅" : ""));
    }
    catch { /* ignore */ }
    const { data: channels } = await supabaseAdmin
        .from("alert_channels").select("*").eq("owner_id", server.owner_id).eq("enabled", true);
    if (!channels?.length)
        return;
    const message = `${header}\n${server.name}\n${plainLines.join("\n")}`;
    await Promise.allSettled(channels.map(async (ch) => {
        try {
            if (ch.kind === "telegram") {
                const token = process.env.TELEGRAM_BOT_TOKEN;
                let botToken = token ?? "";
                let chatId = ch.target?.trim() ?? "";
                if (chatId.includes(":")) {
                    const [t, c] = chatId.split(":");
                    botToken = t;
                    chatId = c;
                }
                if (!botToken || !chatId)
                    return;
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: chatId, text: message }),
                });
            }
            else if (ch.kind === "discord") {
                await fetch(ch.target, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: "StreamMonitor IPTV", content: message }),
                });
            }
            else if (ch.kind === "webhook") {
                await fetch(ch.target, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: "iptv_alert", server_id: serverId, items, at: new Date().toISOString(),
                    }),
                });
            }
        }
        catch { /* best-effort */ }
    }));
}
/** Notifica sobre novos conteúdos detectados no catálogo. */
export async function notifyNewContent(serverId, item, opts = {}) {
    const { data: server } = await supabaseAdmin
        .from("servers").select("id, owner_id, name").eq("id", serverId).maybeSingle();
    if (!server)
        return;
    const { data: profile } = await supabaseAdmin
        .from("profiles").select("telegram_iptv_style").eq("id", server.owner_id).maybeSingle();
    const style = profile?.telegram_iptv_style || 'summary';
    // Se for alerta importante (raro, primeira detecção ou explicitamente marcado), manda individual
    const isImportant = opts.isRare || opts.isFirst;
    if (style === 'individual' || (style === 'important' && isImportant)) {
        await sendIndividualNotification(server, item, opts);
    }
    else {
        // Caso contrário, enfileira para o resumo de 15 min
        await supabaseAdmin.from("iptv_notification_queue").insert({
            owner_id: server.owner_id,
            server_id: server.id,
            kind: item.kind,
            name: item.name,
            category: item.category,
            is_rare: opts.isRare || false,
            is_first_detection: opts.isFirst || false
        });
    }
}
async function sendIndividualNotification(server, item, opts) {
    const { data: globalInfo } = await supabaseAdmin
        .from("tmdb_content_history")
        .select("servers_found_count")
        .eq("title_key", require("./iptv-catalog.server").titleKey(item.name))
        .maybeSingle();
    const icon = item.kind === "live" ? "📡" : (item.kind === "series" ? "📺" : (item.kind === "system" ? "🔥" : "🎬"));
    const kindLabel = item.kind === "live" ? "Canal" : (item.kind === "series" ? "Série" : (item.kind === "system" ? "Aviso" : "Filme"));
    const prefix = opts.isRare ? "🚨 <b>Conteúdo Raro</b>\n" : (opts.isFirst ? "🚨 <b>Primeira Detecção</b>\n" : "🚨 <b>Novo conteúdo detectado</b>\n");
    const message = `${prefix}\n` +
        `${icon} ${kindLabel}:\n<b>${item.name}</b>\n\n` +
        `🔥 Adicionado primeiro:\n${server.name}\n\n` +
        `📺 Encontrado em:\n${globalInfo?.servers_found_count || 1} servidores\n\n` +
        `Confira no painel: streammonitor.site/app/inteligencia`;
    // Notifica o admin
    try {
        const { notifyAdmin } = await import("./admin-telegram.server");
        await notifyAdmin(message);
    }
    catch { /* ignore */ }
    // Notifica os canais do usuário
    const { data: channels } = await supabaseAdmin
        .from("alert_channels").select("*").eq("owner_id", server.owner_id).eq("enabled", true).eq("kind", "telegram");
    if (channels?.length) {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        for (const ch of channels) {
            let botToken = token ?? "";
            let chatId = ch.target?.trim() ?? "";
            if (chatId.includes(":")) {
                const [t, c] = chatId.split(":");
                botToken = t;
                chatId = c;
            }
            if (!botToken || !chatId)
                continue;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
            }).catch(() => { });
        }
    }
}
/** Processa a fila de notificações pendentes. Chamado via cron a cada 15 min. */
export async function flushIptvNotificationQueue() {
    const { data: pending } = await supabaseAdmin
        .from("iptv_notification_queue")
        .select("*, servers(name)")
        .is("sent_at", null)
        .order("created_at", { ascending: true });
    if (!pending?.length)
        return;
    // Agrupa por owner_id
    const byOwner = {};
    for (const item of pending) {
        if (!byOwner[item.owner_id])
            byOwner[item.owner_id] = [];
        byOwner[item.owner_id].push(item);
    }
    for (const [ownerId, items] of Object.entries(byOwner)) {
        const { data: channels } = await supabaseAdmin
            .from("alert_channels").select("*").eq("owner_id", ownerId).eq("enabled", true).eq("kind", "telegram");
        if (!channels?.length)
            continue;
        const movies = items.filter(i => i.kind === 'vod');
        const series = items.filter(i => i.kind === 'series');
        const servers = Array.from(new Set(items.map(i => i.servers?.name))).filter(Boolean);
        let message = "";
        if (items.length > 50) {
            message = `🔥 <b>${items.length} novos conteúdos detectados</b>\n\n` +
                `Muitas novidades foram encontradas nos últimos 15 minutos.\n\n` +
                `Veja o relatório completo no painel.\n` +
                `streammonitor.site/app/inteligencia`;
        }
        else {
            message = `🔥 <b>Novos conteúdos detectados</b>\n\n` +
                `Foram encontrados ${items.length} novos conteúdos:\n\n`;
            if (movies.length > 0) {
                message += `🎬 <b>Filmes:</b>\n` + movies.slice(0, 10).map(m => `• ${m.name}`).join("\n") + "\n";
                if (movies.length > 10)
                    message += `<i>... e mais ${movies.length - 10} filmes</i>\n`;
                message += "\n";
            }
            if (series.length > 0) {
                message += `📺 <b>Séries:</b>\n` + series.slice(0, 10).map(s => `• ${s.name}`).join("\n") + "\n";
                if (series.length > 10)
                    message += `<i>... e mais ${series.length - 10} séries</i>\n`;
                message += "\n";
            }
            if (servers.length > 0) {
                message += `🏆 <b>Primeiros servidores a adicionar:</b>\n${servers.join(", ")}\n\n`;
            }
            message += `⏰ <b>Período:</b>\nÚltimos 15 minutos`;
        }
        const token = process.env.TELEGRAM_BOT_TOKEN;
        for (const ch of channels) {
            let botToken = token ?? "";
            let chatId = ch.target?.trim() ?? "";
            if (chatId.includes(":")) {
                const [t, c] = chatId.split(":");
                botToken = t;
                chatId = c;
            }
            if (!botToken || !chatId)
                continue;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
            }).catch(() => { });
        }
        // Marca como enviado
        await supabaseAdmin
            .from("iptv_notification_queue")
            .update({ sent_at: new Date().toISOString() })
            .in("id", items.map(i => i.id));
    }
}
