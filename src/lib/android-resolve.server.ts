/**
 * Resolução automática de servidor Xtream para o app Stream Monitor Play.
 * Testa as credenciais do cliente contra os servidores monitorados até achar
 * aquele em que o login retorna auth=1.
 */

const PROBE_UA = 'IPTVSmartersPlayer';
const PROBE_TIMEOUT_MS = 7000;
const BATCH = 6;

export function normalizeBase(raw: string): string {
  let v = (raw || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  return v;
}

export type ProbeTarget = { id: string; name: string | null; host: string; owner_id: string | null };

async function xtreamAuth(base: string, username: string, password: string): Promise<boolean> {
  const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': PROBE_UA, Accept: '*/*' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { user_info?: { auth?: number; status?: string } };
    return json?.user_info?.auth === 1;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Testa as credenciais em lotes; devolve o primeiro servidor que autenticar. */
export async function resolveServerForCredentials(
  targets: ProbeTarget[],
  username: string,
  password: string,
): Promise<{ server: ProbeTarget; base: string } | null> {
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (t) => {
        const base = normalizeBase(t.host);
        if (!base) return null;
        const ok = await xtreamAuth(base, username, password);
        return ok ? { server: t, base } : null;
      }),
    );
    const hit = results.find((r) => r !== null);
    if (hit) return hit;
  }
  return null;
}

export async function verifySingleServer(
  target: ProbeTarget,
  username: string,
  password: string,
): Promise<boolean> {
  const base = normalizeBase(target.host);
  if (!base) return false;
  return xtreamAuth(base, username, password);
}
