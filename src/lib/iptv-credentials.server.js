// Server-only: acesso controlado às credenciais Xtream + proteção contra força bruta.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptSecret, decryptSecret, isEncrypted } from "./crypto.server";
/**
 * Lê as credenciais do banco e devolve em memória já decifradas.
 * Migra automaticamente registros legados (texto puro) para o formato criptografado.
 */
export async function getIptvCredentials(serverId) {
    const { data } = await supabaseAdmin
        .from("servers")
        .select("iptv_username, iptv_password")
        .eq("id", serverId)
        .maybeSingle();
    if (!data)
        return { username: null, password: null };
    const username = await decryptSecret(data.iptv_username);
    const password = await decryptSecret(data.iptv_password);
    // Migração transparente: se ainda estiver em texto puro, criptografa agora.
    const needsMigration = (data.iptv_username && !isEncrypted(data.iptv_username)) ||
        (data.iptv_password && !isEncrypted(data.iptv_password));
    if (needsMigration) {
        await supabaseAdmin
            .from("servers")
            .update({
            iptv_username: await encryptSecret(username),
            iptv_password: await encryptSecret(password),
        })
            .eq("id", serverId);
    }
    return { username, password };
}
/** Grava credenciais sempre criptografadas. */
export async function setIptvCredentials(serverId, creds) {
    const { error } = await supabaseAdmin
        .from("servers")
        .update({
        iptv_username: await encryptSecret(creds.username),
        iptv_password: await encryptSecret(creds.password),
    })
        .eq("id", serverId);
    if (error)
        throw new Error(error.message);
    // Nova credencial: zera bloqueios anteriores.
    await resetLoginAttempts(serverId);
}
/** Criptografa credenciais em texto puro que ainda existam no banco (job de manutenção). */
export async function migratePlaintextCredentials(limit = 200) {
    const { data } = await supabaseAdmin
        .from("servers")
        .select("id, iptv_username, iptv_password")
        .or("iptv_username.not.is.null,iptv_password.not.is.null")
        .limit(limit);
    let migrated = 0;
    for (const s of data ?? []) {
        if (isEncrypted(s.iptv_username ?? "") && isEncrypted(s.iptv_password ?? ""))
            continue;
        if (!s.iptv_username && !s.iptv_password)
            continue;
        await supabaseAdmin
            .from("servers")
            .update({
            iptv_username: await encryptSecret(s.iptv_username),
            iptv_password: await encryptSecret(s.iptv_password),
        })
            .eq("id", s.id);
        migrated++;
    }
    return { migrated };
}
/* ------------------------------------------------------------------ */
/* Controle de tentativas de login (anti força bruta)                  */
/* ------------------------------------------------------------------ */
const MAX_FAILURES = 5;
/** Bloqueio progressivo a partir da 5ª falha consecutiva. */
function blockMinutes(failures) {
    if (failures < MAX_FAILURES)
        return null;
    if (failures < 7)
        return 15;
    if (failures < 10)
        return 60;
    return 360;
}
export async function checkLoginGuard(serverId) {
    const { data } = await supabaseAdmin
        .from("iptv_login_attempts")
        .select("failures, blocked_until")
        .eq("server_id", serverId)
        .maybeSingle();
    const blockedUntil = data?.blocked_until ?? null;
    const blocked = !!blockedUntil && new Date(blockedUntil).getTime() > Date.now();
    return { allowed: !blocked, blockedUntil, failures: data?.failures ?? 0 };
}
export function guardMessage(guard) {
    const until = guard.blockedUntil ? new Date(guard.blockedUntil).toLocaleString("pt-BR") : "";
    return `🔒 Tentativas de login bloqueadas temporariamente após ${guard.failures} falhas consecutivas. Novas tentativas liberadas em ${until}. Revise usuário e senha do Xtream antes de tentar novamente.`;
}
/** Registra o resultado de uma tentativa de autenticação Xtream. */
export async function registerLoginResult(serverId, ok, reason) {
    const nowIso = new Date().toISOString();
    if (ok) {
        await supabaseAdmin.from("iptv_login_attempts").upsert({ server_id: serverId, failures: 0, last_attempt_at: nowIso, blocked_until: null, last_reason: null }, { onConflict: "server_id" });
        return { allowed: true, blockedUntil: null, failures: 0 };
    }
    const { data } = await supabaseAdmin
        .from("iptv_login_attempts")
        .select("failures")
        .eq("server_id", serverId)
        .maybeSingle();
    const failures = (data?.failures ?? 0) + 1;
    const mins = blockMinutes(failures);
    const blockedUntil = mins ? new Date(Date.now() + mins * 60000).toISOString() : null;
    await supabaseAdmin.from("iptv_login_attempts").upsert({
        server_id: serverId,
        failures,
        last_attempt_at: nowIso,
        last_failure_at: nowIso,
        blocked_until: blockedUntil,
        // Nunca guardar credencial: apenas o motivo já sanitizado.
        last_reason: reason?.slice(0, 200) ?? null,
    }, { onConflict: "server_id" });
    return { allowed: !blockedUntil, blockedUntil, failures };
}
export async function resetLoginAttempts(serverId) {
    await supabaseAdmin.from("iptv_login_attempts").upsert({ server_id: serverId, failures: 0, blocked_until: null, last_reason: null }, { onConflict: "server_id" });
}
