import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Enhanced subscription check that accounts for reseller credits.
 * Returns true if the user has an active subscription AND (if reseller) has credits > 0.
 * Admins always pass.
 */
export async function isServiceActive(userId: string): Promise<boolean> {
  const set = await getActiveOwnerIds([userId]);
  return set.has(userId);
}

/**
 * Resolve, em lote, quais donos podem consumir recursos de monitoramento.
 *
 * Regras (mesmas de isServiceActive):
 *  - Admin: sempre ativo.
 *  - Revendedor: depende SOMENTE de créditos > 0 (carteira ou perfil).
 *  - Cliente: depende SOMENTE de assinatura válida (active/trial não expirada).
 *
 * Usado por todos os jobs automáticos para nunca buscar/checar DNS,
 * Xtream, conteúdos ou alertas de contas com teste expirado.
 */
export async function getActiveOwnerIds(ownerIds: string[]): Promise<Set<string>> {
  const ids = Array.from(new Set(ownerIds.filter(Boolean)));
  const active = new Set<string>();
  if (!ids.length) return active;

  const [{ data: roles }, { data: profiles }, { data: wallets }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").in("user_id", ids),
    supabaseAdmin.from("profiles").select("id, is_reseller, credits").in("id", ids),
    supabaseAdmin.from("reseller_wallet").select("reseller_id, credits").in("reseller_id", ids),
    supabaseAdmin.from("subscriptions").select("user_id, status, expires_at").in("user_id", ids),
  ]);

  const adminSet = new Set((roles ?? []).map((r: any) => r.user_id));
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const walletMap = new Map((wallets ?? []).map((w: any) => [w.reseller_id, w.credits ?? 0]));
  const subMap = new Map((subs ?? []).map((s: any) => [s.user_id, s]));
  const now = Date.now();

  for (const id of ids) {
    if (adminSet.has(id)) { active.add(id); continue; }

    const profile: any = profileMap.get(id);
    const credits = Math.max(Number(profile?.credits ?? 0), Number(walletMap.get(id) ?? 0));

    if (profile?.is_reseller) {
      if (credits > 0) active.add(id);
      continue;
    }

    const sub: any = subMap.get(id);
    const subActive =
      !!sub &&
      (sub.status === "active" || sub.status === "trial") &&
      new Date(sub.expires_at).getTime() > now;
    if (subActive) active.add(id);
  }

  return active;
}

/** Conveniência: o dono deste servidor pode executar monitoramento agora? */
export async function isServerMonitoringAllowed(serverId: string): Promise<boolean> {
  const { data: srv } = await supabaseAdmin
    .from("servers")
    .select("owner_id")
    .eq("id", serverId)
    .maybeSingle();
  if (!srv?.owner_id) return false;
  return await isServiceActive(srv.owner_id);
}

export const MONITORING_PAUSED_MESSAGE =
  "Monitoramento pausado: assinatura expirada ou sem créditos. Renove para reativar as verificações.";

export const PAUSE_REASON_EXPIRED = "subscription_expired";

/**
 * Marca/desmarca no banco os servidores (DNS) de contas sem acesso.
 *
 *  - Conta inativa  -> monitoring_paused = true, paused_reason = 'subscription_expired'
 *  - Conta reativada -> volta automaticamente ao monitoramento (apenas se a pausa
 *    tiver sido causada por assinatura/créditos; pausas manuais são preservadas).
 *
 * Nada é apagado: só o estado de monitoramento muda.
 */
export async function syncServersPauseState(ownerIds?: string[]): Promise<{ paused: number; resumed: number }> {
  let query = supabaseAdmin.from("servers").select("id, owner_id, monitoring_paused, paused_reason");
  if (ownerIds?.length) query = query.in("owner_id", Array.from(new Set(ownerIds.filter(Boolean))));
  const { data: servers } = await query;
  if (!servers?.length) return { paused: 0, resumed: 0 };

  const active = await getActiveOwnerIds(servers.map((s: any) => s.owner_id));

  const toPause = servers
    .filter((s: any) => !active.has(s.owner_id) && !s.monitoring_paused)
    .map((s: any) => s.id);
  const toResume = servers
    .filter((s: any) => active.has(s.owner_id) && s.monitoring_paused && s.paused_reason === PAUSE_REASON_EXPIRED)
    .map((s: any) => s.id);

  if (toPause.length) {
    await supabaseAdmin
      .from("servers")
      .update({ monitoring_paused: true, paused_reason: PAUSE_REASON_EXPIRED, paused_at: new Date().toISOString() })
      .in("id", toPause);
  }
  if (toResume.length) {
    await supabaseAdmin
      .from("servers")
      .update({ monitoring_paused: false, paused_reason: null, paused_at: null })
      .in("id", toResume);
  }

  return { paused: toPause.length, resumed: toResume.length };
}
