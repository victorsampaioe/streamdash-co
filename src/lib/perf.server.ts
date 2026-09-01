/**
 * Ranking de Delay / Performance dos Servidores.
 *
 * Mede a EXPERIÊNCIA REAL do servidor IPTV (não ping ICMP):
 *   A. Latência da Player API (player_api.php)
 *   B. Tempo de abertura do stream (até os primeiros bytes válidos)
 *   C. Tempo total de inicialização (API + abertura)
 *   D. Estabilidade — calculada no banco a partir do histórico de `checks`
 *
 * O teste é sempre executado no backend (Painel ou Core AWS). Nenhuma
 * credencial, URL interna ou token sai para o navegador: o frontend só lê
 * o resultado agregado em `server_perf_runs`.
 */
import { PERF_API_TIMEOUT_MS, PERF_STREAM_TIMEOUT_MS, PERF_SAMPLE_SIZE } from "./perf-thresholds";

export type PerfState = "ok" | "timeout" | "stream_unavailable" | "offline" | "error";

export type PerfMeasurement = {
  api_ms: number | null;
  open_ms: number | null;
  open_min_ms: number | null;
  open_max_ms: number | null;
  total_ms: number | null;
  samples: number;
  ok: boolean;
  state: PerfState;
  error: string | null;
};

const UA = "IPTVSmartersPlayer/3.1.5 (Linux; Android 11) ExoPlayerLib/2.18.1";

function headers() {
  return { "User-Agent": UA, Accept: "*/*", Connection: "close" } as Record<string, string>;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

async function timed(url: string, timeoutMs: number, extra?: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { ...headers(), ...extra }, signal: ctrl.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function isTimeout(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e).toLowerCase();
  return m.includes("abort") || m.includes("timeout");
}

/**
 * Mede o tempo até os primeiros bytes válidos e ABORTA — nunca baixa o canal.
 * Retorna null quando o stream não iniciou.
 */
async function openStream(url: string): Promise<number | null> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PERF_STREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { ...headers(), Range: "bytes=0-65535" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok && res.status !== 206) return null;
    const body = res.body;
    if (!body) {
      const text = await res.text();
      return /#EXTM3U/i.test(text) ? Date.now() - t0 : null;
    }
    const reader = body.getReader();
    let received = 0;
    let first: Uint8Array | null = null;
    while (received < 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        first ??= value;
        received += value.byteLength;
      }
    }
    const ms = Date.now() - t0;
    try {
      await reader.cancel();
    } catch {
      /* stream já encerrado */
    }
    if (!first || received < 64) return null;
    const head = new TextDecoder().decode(first.slice(0, 64));
    const validManifest = /#EXTM3U/i.test(head);
    const validTs = first[0] === 0x47;
    if (!validManifest && !validTs && received < 4096) return null;
    return ms;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Sonda STATELESS: pode rodar no Core AWS, não toca no banco. */
export async function measureServerPerformance(
  host: string,
  username: string | null,
  password: string | null,
): Promise<PerfMeasurement> {
  const base = `http://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const empty: PerfMeasurement = {
    api_ms: null, open_ms: null, open_min_ms: null, open_max_ms: null,
    total_ms: null, samples: 0, ok: false, state: "error", error: null,
  };
  if (!username || !password) return { ...empty, error: "credenciais IPTV ausentes" };

  const auth = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const started = Date.now();

  // A. Latência da Player API
  let apiMs: number | null = null;
  let info: any = null;
  try {
    const t0 = Date.now();
    const res = await timed(`${base}/player_api.php?${auth}`, PERF_API_TIMEOUT_MS);
    apiMs = Date.now() - t0;
    const text = await res.text();
    if (res.status !== 200) return { ...empty, api_ms: apiMs, state: "offline", error: `API HTTP ${res.status}` };
    try {
      info = JSON.parse(text);
    } catch {
      return { ...empty, api_ms: apiMs, state: "error", error: "Player API não retornou JSON" };
    }
    if (info?.user_info?.auth !== 1) {
      return { ...empty, api_ms: apiMs, state: "offline", error: "login recusado pelo servidor" };
    }
  } catch (e) {
    return {
      ...empty,
      state: isTimeout(e) ? "timeout" : "offline",
      error: isTimeout(e) ? "timeout na Player API" : String((e as Error)?.message ?? e).slice(0, 160),
    };
  }

  // Amostra pequena de canais válidos (nunca dezenas)
  let ids: string[] = [];
  try {
    const res = await timed(`${base}/player_api.php?${auth}&action=get_live_streams`, PERF_API_TIMEOUT_MS);
    const list = (await res.json()) as Array<{ stream_id?: number | string }>;
    if (Array.isArray(list)) {
      const step = Math.max(1, Math.floor(list.length / (PERF_SAMPLE_SIZE + 1)));
      for (let i = 0; i < list.length && ids.length < PERF_SAMPLE_SIZE; i += step) {
        const id = list[i]?.stream_id;
        if (id != null) ids.push(String(id));
      }
    }
  } catch {
    /* catálogo indisponível: tratado abaixo */
  }
  if (!ids.length) {
    return { ...empty, api_ms: apiMs, total_ms: Date.now() - started, state: "stream_unavailable", error: "nenhum canal disponível para amostragem" };
  }

  // B/C. Tempo de abertura por amostra
  const opens: number[] = [];
  for (const id of ids) {
    const m3u8 = await openStream(`${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.m3u8`);
    const ms =
      m3u8 ??
      (await openStream(`${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(password)}/${id}.ts`));
    if (ms != null) opens.push(ms);
  }

  if (!opens.length) {
    return {
      ...empty, api_ms: apiMs, total_ms: Date.now() - started,
      state: "stream_unavailable", error: "servidor online, mas nenhum stream iniciou",
    };
  }

  const open = median(opens)!;
  return {
    api_ms: apiMs,
    open_ms: open,
    open_min_ms: Math.min(...opens),
    open_max_ms: Math.max(...opens),
    total_ms: (apiMs ?? 0) + open,
    samples: opens.length,
    ok: true,
    state: "ok",
    error: null,
  };
}

/** Executa e PERSISTE a medição de um servidor (delegando ao Core quando possível). */
export async function runServerPerfTest(serverId: string): Promise<PerfMeasurement & { server_id: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: srv } = await supabaseAdmin
    .from("servers")
    .select("id, host")
    .eq("id", serverId)
    .maybeSingle();
  if (!srv) throw new Error("Servidor não encontrado");

  const { getIptvCredentials } = await import("./iptv-credentials.server");
  const creds = await getIptvCredentials(srv.id);
  const { runOnCore } = await import("./core-api.server");

  const result = await runOnCore<PerfMeasurement>(
    "probe-perf",
    { host: srv.host, username: creds.username, password: creds.password },
    () => measureServerPerformance(srv.host, creds.username, creds.password),
  );

  await supabaseAdmin.from("server_perf_runs").insert({
    server_id: srv.id,
    api_ms: result.api_ms,
    open_ms: result.open_ms,
    open_min_ms: result.open_min_ms,
    open_max_ms: result.open_max_ms,
    total_ms: result.total_ms,
    samples: result.samples,
    ok: result.ok,
    state: result.state,
    error: result.error,
    source: "core",
  });

  return { ...result, server_id: srv.id };
}

/**
 * Lote de medições em fila com concorrência limitada — evita sobrecarregar
 * o Core e os servidores IPTV monitorados.
 */
export async function runPerfBatch(limit = 5): Promise<{ tested: number; ok: number; errors: string[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();

  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select("id")
    .eq("monitoring_paused", false)
    .not("iptv_username", "is", null)
    .limit(200);

  const candidates: string[] = [];
  for (const s of servers ?? []) {
    const { data: last } = await supabaseAdmin
      .from("server_perf_runs")
      .select("measured_at")
      .eq("server_id", s.id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last || last.measured_at < cutoff) candidates.push(s.id);
    if (candidates.length >= limit) break;
  }

  const { runPool } = await import("./pool");
  const errors: string[] = [];
  let ok = 0;
  const results = await runPool(
    candidates,
    async (id) => await runServerPerfTest(id),
    { concurrency: 2, jitterMs: 500 },
  );
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) ok++;
    else if (r.status === "rejected") errors.push(String((r.reason as Error)?.message ?? r.reason).slice(0, 160));
  }
  return { tested: candidates.length, ok, errors };
}
