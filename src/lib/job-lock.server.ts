/**
 * Travas de ciclo (anti-sobreposição) para os agendadores.
 *
 * O pg_cron dispara /api/public/cron/check e /api/public/cron/radar a cada
 * minuto. Se um ciclo demora mais que isso, o próximo entrava o anterior e
 * gera fila + timeouts. Estas travas fazem o novo ciclo desistir na hora.
 */

const localLocks = new Map<string, number>();

// A execução pode ser encerrada antes de liberar a trava local. Assim como
// a trava SQL, esta expira automaticamente após o TTL configurado.
function localLockHeld(name: string): boolean {
  const expiresAt = localLocks.get(name);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    localLocks.delete(name);
    return false;
  }
  return true;
}

function setLocalLock(name: string, ttlSeconds: number): void {
  localLocks.set(name, Date.now() + Math.max(1, ttlSeconds) * 1000);
}

const HOLDER = `${process.env.IS_CORE === "true" ? "core" : "panel"}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

export async function tryAcquireLock(name: string, ttlSeconds: number): Promise<boolean> {
  if (localLockHeld(name)) return false;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("try_acquire_cron_lock", {
      _name: name,
      _ttl_seconds: ttlSeconds,
      _holder: HOLDER,
    } as never);
    if (error) {
      console.warn(`[lock] falha ao adquirir "${name}": ${error.message}`);
      // Se a RPC estiver indisponível, usa uma trava local. Isso protege
      // contra sobreposição nesta instância, mas não entre múltiplas instâncias.
      if (localLockHeld(name)) return false;
      setLocalLock(name, ttlSeconds);
      return true;
    }
    if (!data || localLockHeld(name)) return false;
    setLocalLock(name, ttlSeconds);
    return true;
  } catch (e: any) {
    console.warn(`[lock] indisponível para "${name}": ${e?.message}`);
    if (localLockHeld(name)) return false;
    setLocalLock(name, ttlSeconds);
    return true;
  }
}

export async function releaseLock(name: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("release_cron_lock", { _name: name } as never);
  } catch {
    /* a trava distribuída expira sozinha pelo TTL */
  } finally {
    localLocks.delete(name);
  }
}

/** Executa `fn` apenas se ninguém mais estiver rodando o mesmo ciclo. */
export async function withCycleLock<T>(
  name: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | { skipped: true; reason: string; lock: string }> {
  const acquired = await tryAcquireLock(name, ttlSeconds);
  if (!acquired) {
    console.warn(`[lock] ciclo "${name}" ignorado: execução anterior ainda em andamento`);
    return { skipped: true, reason: "ciclo anterior ainda em execução", lock: name };
  }
  const started = Date.now();
  console.log(`[cycle] ▶ início "${name}"`);
  try {
    return await fn();
  } finally {
    console.log(`[cycle] ■ fim "${name}" em ${Date.now() - started}ms`);
    await releaseLock(name);
  }
}
