/**
 * Regras de autorização específicas das APIs do Stream Play.
 *
 * - registra quais servidores foram oferecidos em cada login (resolution grant);
 * - só permite associar um servidor que realmente foi oferecido àquele cliente;
 * - centraliza a checagem de licença do revendedor.
 */

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hashKey, safeLog } from "@/lib/api-security.server";

const GRANT_TTL_SECONDS = 20 * 60;

export type ResolutionGrant = { token: string; expires_at: string };

/** Cria a autorização de resolução com a lista exata de candidatos ofertados. */
export async function createResolutionGrant(
  clientKey: string,
  serverIds: string[],
): Promise<ResolutionGrant | null> {
  try {
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + GRANT_TTL_SECONDS * 1000).toISOString();
    await supabaseAdmin.from("android_resolution_grants").insert({
      grant_hash: hashKey(token),
      client_key: clientKey,
      candidate_server_ids: serverIds,
      expires_at: expiresAt,
    });
    return { token, expires_at: expiresAt };
  } catch (error) {
    safeLog("ANDROID GRANT", "falha ao criar", { error: (error as Error).message });
    return null;
  }
}

/**
 * Verifica se o `server_id` pode ser associado a este cliente.
 * Aceita o token de resolução (novo contrato) ou, por compatibilidade com o
 * APK atual, qualquer grant válido daquele cliente que contenha o servidor.
 */
export async function isServerOfferedTo(
  clientKey: string,
  serverId: string,
  token?: string | null,
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  if (token) {
    const { data } = await supabaseAdmin
      .from("android_resolution_grants")
      .select("id, client_key, candidate_server_ids, expires_at")
      .eq("grant_hash", hashKey(token))
      .maybeSingle();
    if (!data) return false;
    if (data.client_key !== clientKey) return false;
    if (data.expires_at < nowIso) return false;
    return (data.candidate_server_ids ?? []).includes(serverId);
  }

  const { data: grants } = await supabaseAdmin
    .from("android_resolution_grants")
    .select("candidate_server_ids")
    .eq("client_key", clientKey)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(5);

  return (grants ?? []).some((g) => (g.candidate_server_ids ?? []).includes(serverId));
}

/** Bloqueia apenas quando existe licença cadastrada e ela está inativa/vencida. */
export async function licenseBlocked(resellerId: string | null): Promise<boolean> {
  if (!resellerId) return false;
  try {
    const { data } = await supabaseAdmin.rpc("validate_android_play_access", {
      _reseller_id: resellerId,
    });
    const row = Array.isArray(data) ? (data[0] as { is_active?: boolean } | undefined) : null;
    if (!row) return false;
    return !row.is_active;
  } catch (error) {
    safeLog("ANDROID LICENSE", "falha ao validar", { error: (error as Error).message });
    return false;
  }
}
