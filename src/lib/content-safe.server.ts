// Modo Seguro de Verificação de Conteúdos.
// Guarda, por servidor, o nível de "freio" aplicado quando o alvo começa a
// responder 401/403/429 (sinais de bloqueio anti-bot / rate limit).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ThrottleState = {
  /** 0 = normal, 1..4 = cada vez mais lento. */
  level: number;
  /** ISO da última vez que detectamos bloqueio. */
  lastBlockAt: string | null;
  /** ISO até quando o servidor fica em descanso (nenhum teste automático). */
  cooldownUntil: string | null;
  updatedAt: string;
};

export const MAX_THROTTLE_LEVEL = 4;

/** Multiplicador de pausa e divisor de concorrência por nível. */
export const THROTTLE_FACTOR = [1, 2, 3, 5, 8];

/** Minutos de descanso ao atingir cada nível. */
export const THROTTLE_COOLDOWN_MIN = [0, 5, 15, 40, 120];

const KEY = (serverId: string) => `content_throttle:${serverId}`;

const EMPTY: ThrottleState = {
  level: 0,
  lastBlockAt: null,
  cooldownUntil: null,
  updatedAt: new Date(0).toISOString(),
};

export async function getThrottle(serverId: string): Promise<ThrottleState> {
  const { data } = await supabaseAdmin
    .from("app_settings").select("value").eq("key", KEY(serverId)).maybeSingle();
  const v = (data?.value ?? null) as Partial<ThrottleState> | null;
  if (!v) return { ...EMPTY };
  return {
    level: Math.min(Math.max(Number(v.level ?? 0), 0), MAX_THROTTLE_LEVEL),
    lastBlockAt: v.lastBlockAt ?? null,
    cooldownUntil: v.cooldownUntil ?? null,
    updatedAt: v.updatedAt ?? EMPTY.updatedAt,
  };
}

async function save(serverId: string, state: ThrottleState) {
  await supabaseAdmin.from("app_settings").upsert(
    { key: KEY(serverId), value: state as any, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

/** Sobe um nível de freio e agenda o descanso do servidor. */
export async function escalateThrottle(serverId: string): Promise<ThrottleState> {
  const cur = await getThrottle(serverId);
  const level = Math.min(cur.level + 1, MAX_THROTTLE_LEVEL);
  const now = new Date();
  const state: ThrottleState = {
    level,
    lastBlockAt: now.toISOString(),
    cooldownUntil: new Date(now.getTime() + THROTTLE_COOLDOWN_MIN[level] * 60_000).toISOString(),
    updatedAt: now.toISOString(),
  };
  await save(serverId, state);
  return state;
}

/** Uma rodada limpa reduz o freio gradualmente. */
export async function relaxThrottle(serverId: string): Promise<ThrottleState> {
  const cur = await getThrottle(serverId);
  if (cur.level === 0 && !cur.cooldownUntil) return cur;
  const state: ThrottleState = {
    level: Math.max(0, cur.level - 1),
    lastBlockAt: cur.lastBlockAt,
    cooldownUntil: null,
    updatedAt: new Date().toISOString(),
  };
  await save(serverId, state);
  return state;
}

export function isCoolingDown(state: ThrottleState) {
  return !!state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
