/**
 * Sessão do Stream Play (Android).
 *
 * - Access token curto assinado com HMAC-SHA256 (ANDROID_SESSION_SECRET).
 * - Refresh token opaco com rotação, guardado apenas como hash no banco.
 * - Claims: cliente (hash), reseller_id, server_id, device_id, escopos, expiração.
 * - NUNCA contém senha IPTV nem qualquer segredo administrativo.
 * - Não existe segredo compartilhado dentro do APK: a assinatura é validada
 *   somente no servidor.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hashKey, safeLog } from "@/lib/api-security.server";

const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutos
const REFRESH_TTL_SECONDS = 30 * 24 * 3600; // 30 dias

export type SessionClaims = {
  sub: string; // hash do cliente (username), nunca o texto puro
  rid: string | null; // reseller_id
  sid: string | null; // server_id
  did: string | null; // device_id
  scp: string[]; // escopos
  exp: number; // epoch em segundos
  jti: string;
};

export type IssuedSession = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  expires_at: string;
  refresh_token: string;
  refresh_expires_at: string;
  scopes: string[];
};

function secret(): string {
  const value = process.env["ANDROID_SESSION_SECRET"];
  if (!value) throw new Error("ANDROID_SESSION_SECRET ausente");
  return value;
}

const b64u = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64u = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(payload: string): string {
  return b64u(createHmac("sha256", secret()).update(payload).digest());
}

export function clientKeyOf(username: string): string {
  return hashKey(`android-client:${username.trim().toLowerCase()}`);
}

export async function issueSession(input: {
  clientKey: string;
  resellerId: string | null;
  serverId: string | null;
  deviceId: string | null;
  scopes?: string[];
}): Promise<IssuedSession | null> {
  try {
    const scopes = input.scopes ?? ["play"];
    const now = Date.now();
    const exp = Math.floor(now / 1000) + ACCESS_TTL_SECONDS;
    const jti = randomBytes(16).toString("hex");

    let deviceUuid: string | null = null;
    if (input.deviceId) {
      const { data } = await supabaseAdmin
        .from("android_devices")
        .upsert(
          {
            device_id: input.deviceId,
            reseller_id: input.resellerId,
            server_id: input.serverId,
            client_key: input.clientKey,
            last_seen_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
          { onConflict: "device_id" },
        )
        .select("id, revoked")
        .maybeSingle();
      if (data?.revoked) return null;
      deviceUuid = data?.id ?? null;
    }

    const claims: SessionClaims = {
      sub: input.clientKey,
      rid: input.resellerId,
      sid: input.serverId,
      did: input.deviceId,
      scp: scopes,
      exp,
      jti,
    };
    const payload = b64u(JSON.stringify(claims));
    const accessToken = `${payload}.${sign(payload)}`;
    const refreshToken = randomBytes(32).toString("hex");

    await supabaseAdmin.from("android_sessions").insert({
      device_uuid: deviceUuid,
      access_token_hash: hashKey(accessToken),
      refresh_token_hash: hashKey(refreshToken),
      reseller_id: input.resellerId,
      server_id: input.serverId,
      client_key: input.clientKey,
      scopes,
      expires_at: new Date(exp * 1000).toISOString(),
      refresh_expires_at: new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString(),
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SECONDS,
      expires_at: new Date(exp * 1000).toISOString(),
      refresh_token: refreshToken,
      refresh_expires_at: new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString(),
      scopes,
    };
  } catch (error) {
    safeLog("ANDROID SESSION", "falha ao emitir sessão", { error: (error as Error).message });
    return null; // sessão é aditiva: falha aqui não quebra o login legado
  }
}

/** Verifica assinatura, expiração e revogação. */
export async function verifyAccessToken(token: string): Promise<SessionClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];

  const expected = fromB64u(sign(payload));
  const provided = fromB64u(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(fromB64u(payload).toString("utf8")) as SessionClaims;
  } catch {
    return null;
  }
  if (!claims?.exp || claims.exp * 1000 < Date.now()) return null;

  const { data } = await supabaseAdmin
    .from("android_sessions")
    .select("revoked_at")
    .eq("access_token_hash", hashKey(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;

  return claims;
}

export function bearerFrom(headers: Headers): string | null {
  const raw = headers.get("authorization") ?? headers.get("Authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() ?? null;
}

/** Rotaciona a sessão a partir de um refresh token válido. */
export async function refreshSession(refreshToken: string): Promise<IssuedSession | null> {
  const { data: row } = await supabaseAdmin
    .from("android_sessions")
    .select("id, client_key, reseller_id, server_id, scopes, refresh_expires_at, revoked_at, device_uuid")
    .eq("refresh_token_hash", hashKey(refreshToken))
    .maybeSingle();

  if (!row || row.revoked_at) return null;
  if (new Date(row.refresh_expires_at).getTime() < Date.now()) return null;

  let deviceId: string | null = null;
  if (row.device_uuid) {
    const { data: device } = await supabaseAdmin
      .from("android_devices")
      .select("device_id, revoked")
      .eq("id", row.device_uuid)
      .maybeSingle();
    if (device?.revoked) return null;
    deviceId = device?.device_id ?? null;
  }

  // rotação: a sessão antiga é revogada imediatamente
  await supabaseAdmin
    .from("android_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", row.id);

  return issueSession({
    clientKey: row.client_key,
    resellerId: row.reseller_id,
    serverId: row.server_id,
    deviceId,
    scopes: row.scopes ?? ["play"],
  });
}
