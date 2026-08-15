/**
 * Travas de ciclo (anti-sobreposição) para os agendadores.
 *
 * O pg_cron dispara /api/public/cron/check e /api/public/cron/radar a cada
 * minuto. Se um ciclo demora mais que isso, o próximo entrava o anterior e
 * gera fila + timeouts. Estas travas fazem o novo ciclo desistir na hora.
 */

const HOLDER = `${process.env.IS_CORE === "true" ? "core" : "panel"}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;

export async function tryAcquireLock(name: string, ttlSeconds: number): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("try_acquire_cron_lock", {
      _name: name,
      _ttl_seconds: ttlSeconds,
      _holder: HOLDER,
    } as never);
    if (error) {
      console.warn(`[lock] falha ao adquirir "${name}": ${error.message}`);
      return true; // nunca bloqueia o ciclo por falha de infraestrutura
    }
    return Boolean(data);
  } catch (e: any) {
    console.warn(`[lock] indisponível para "${name}": ${e?.message}`);
    return true;
  }
}

export async function releaseLock(name: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("release_cron_lock", { _name: name } as never);
  } catch {
    /* a trava expira sozinha pelo TTL */
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
