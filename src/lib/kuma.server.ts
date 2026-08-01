import { KumaSocket } from "./kuma-socket.server";

export type KumaKind = "http" | "ping" | "dns" | "tcp" | "api" | "ssl";

export const KUMA_KIND_LABEL: Record<KumaKind, string> = {
  http: "HTTP/HTTPS",
  ping: "Ping",
  dns: "DNS Record",
  tcp: "Porta TCP",
  api: "Player API (JSON)",
  ssl: "Certificado SSL",
};

export const KUMA_ID_COLUMN: Record<KumaKind, string> = {
  http: "kuma_http_id",
  ping: "kuma_ping_id",
  dns: "kuma_dns_id",
  tcp: "kuma_tcp_id",
  api: "kuma_api_id",
  ssl: "kuma_ssl_id",
};

export function kumaConfig() {
  const url = process.env.KUMA_URL?.trim();
  const username = process.env.KUMA_USERNAME?.trim();
  const password = process.env.KUMA_PASSWORD;
  return {
    url,
    username,
    password,
    configured: Boolean(url && username && password),
  };
}

function bareHost(host: string) {
  return host
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

const MONITOR_DEFAULTS = {
  interval: 60,
  retryInterval: 60,
  resendInterval: 0,
  maxretries: 1,
  timeout: 16,
  notificationIDList: {},
  accepted_statuscodes: ["200-299"],
  method: "GET",
  body: null,
  headers: null,
  authMethod: null,
  ignoreTls: false,
  upsideDown: false,
  maxredirects: 10,
  expiryNotification: false,
  packetSize: 56,
  dns_resolve_server: "1.1.1.1",
  dns_resolve_type: "A",
  proxyId: null,
  parent: null,
  description: null,
  httpBodyEncoding: "json",
  invertKeyword: false,
  active: true,
};

type ServerRow = {
  id: string;
  name: string;
  host: string;
  kuma_tcp_port?: number | null;
  iptv_username?: string | null;
  iptv_password?: string | null;
};

export function buildMonitorPayload(kind: KumaKind, srv: ServerRow) {
  const host = bareHost(srv.host);
  const name = `[SM] ${srv.name} · ${KUMA_KIND_LABEL[kind]}`;
  switch (kind) {
    case "http":
      return { ...MONITOR_DEFAULTS, type: "http", name, url: `https://${host}` };
    case "ping":
      return { ...MONITOR_DEFAULTS, type: "ping", name, hostname: host, interval: 60 };
    case "dns":
      return {
        ...MONITOR_DEFAULTS,
        type: "dns",
        name,
        hostname: host,
        dns_resolve_server: "1.1.1.1",
        dns_resolve_type: "A",
        port: 53,
      };
    case "tcp":
      return {
        ...MONITOR_DEFAULTS,
        type: "port",
        name,
        hostname: host,
        port: srv.kuma_tcp_port || 80,
      };
    case "api": {
      // Credenciais chegam já decifradas pelo chamador (nunca lidas do banco em texto puro).
      const u = srv.iptv_username ?? "";
      const p = srv.iptv_password ?? "";
      const url = u
        ? `http://${host}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`
        : `http://${host}/player_api.php`;
      return {
        ...MONITOR_DEFAULTS,
        type: "json-query",
        name,
        url,
        jsonPath: "$",
        json_path: "$",
        expectedValue: "",
        jsonPathOperator: "!=",
        interval: 300,
      };
    }
    case "ssl":
      return {
        ...MONITOR_DEFAULTS,
        type: "http",
        name,
        url: `https://${host}`,
        expiryNotification: true,
        interval: 600,
      };
  }
}

export async function kumaLogin(timeoutMs = 20000) {
  const cfg = kumaConfig();
  if (!cfg.configured) throw new Error("Uptime Kuma não configurado");
  const sock = new KumaSocket(cfg.url!);
  await sock.connect(timeoutMs);
  const res = await sock.emitAck<any>("login", [
    { username: cfg.username, password: cfg.password, token: "" },
  ]);
  if (!res?.ok) {
    await sock.close();
    throw new Error(res?.msg ?? "Falha de autenticação no Uptime Kuma");
  }
  return sock;
}

/** Creates any missing monitors for a server. Returns the id map. */
export async function ensureMonitors(srv: ServerRow, existing: Partial<Record<KumaKind, number | null>>) {
  const sock = await kumaLogin();
  const created: Partial<Record<KumaKind, number>> = {};
  try {
    for (const kind of Object.keys(KUMA_KIND_LABEL) as KumaKind[]) {
      if (existing[kind]) continue;
      if (kind === "api" && !srv.iptv_username) continue;
      const payload = buildMonitorPayload(kind, srv);
      const res = await sock.emitAck<any>("add", [payload], 20000);
      if (res?.ok && res.monitorID) created[kind] = Number(res.monitorID);
    }
  } finally {
    await sock.close();
  }
  return created;
}

export async function deleteMonitors(ids: number[]) {
  if (!ids.length) return;
  const sock = await kumaLogin();
  try {
    for (const id of ids) await sock.emitAck("deleteMonitor", [id], 15000).catch(() => null);
  } finally {
    await sock.close();
  }
}

export type KumaSnapshot = {
  monitors: Map<number, any>;
  heartbeats: Map<number, any[]>;
  uptime: Map<number, Record<string, number>>;
  avgPing: Map<number, number>;
  cert: Map<number, any>;
};

/** Logs in and collects the state Uptime Kuma pushes right after authentication. */
export async function collectSnapshot(waitMs = 6000): Promise<KumaSnapshot> {
  const snap: KumaSnapshot = {
    monitors: new Map(),
    heartbeats: new Map(),
    uptime: new Map(),
    avgPing: new Map(),
    cert: new Map(),
  };
  const sock = await kumaLogin();
  sock.on("monitorList", ([list]) => {
    for (const [id, m] of Object.entries(list ?? {})) snap.monitors.set(Number(id), m);
  });
  sock.on("heartbeatList", ([id, list]) => snap.heartbeats.set(Number(id), list ?? []));
  sock.on("heartbeat", ([hb]) => {
    if (!hb?.monitorID) return;
    const arr = snap.heartbeats.get(Number(hb.monitorID)) ?? [];
    arr.push(hb);
    snap.heartbeats.set(Number(hb.monitorID), arr);
  });
  sock.on("uptime", ([id, period, value]) => {
    const cur = snap.uptime.get(Number(id)) ?? {};
    cur[String(period)] = Number(value);
    snap.uptime.set(Number(id), cur);
  });
  sock.on("avgPing", ([id, ping]) => snap.avgPing.set(Number(id), Number(ping)));
  sock.on("certInfo", ([id, info]) => {
    try {
      snap.cert.set(Number(id), typeof info === "string" ? JSON.parse(info) : info);
    } catch {
      /* ignore */
    }
  });

  await new Promise((r) => setTimeout(r, waitMs));
  await sock.close();
  return snap;
}

function statusFromBeat(active: boolean, beat: any): "up" | "down" | "pending" | "maintenance" {
  if (!active) return "maintenance";
  if (!beat) return "pending";
  switch (Number(beat.status)) {
    case 1:
      return "up";
    case 2:
      return "pending";
    case 3:
      return "maintenance";
    default:
      return "down";
  }
}

/** Pulls Kuma state and mirrors it into our tables. Runs from cron / manual sync. */
export async function syncKumaStatuses() {
  const cfg = kumaConfig();
  if (!cfg.configured) return { synced: 0, skipped: true as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select(
      "id, name, host, kuma_enabled, kuma_http_id, kuma_ping_id, kuma_dns_id, kuma_tcp_id, kuma_api_id, kuma_ssl_id",
    )
    .eq("kuma_enabled", true);
  if (!servers?.length) return { synced: 0 };

  const snap = await collectSnapshot();
  let synced = 0;

  for (const srv of servers as any[]) {
    for (const kind of Object.keys(KUMA_KIND_LABEL) as KumaKind[]) {
      const monitorId = srv[KUMA_ID_COLUMN[kind]] as number | null;
      if (!monitorId) continue;
      const monitor = snap.monitors.get(monitorId);
      const beats = snap.heartbeats.get(monitorId) ?? [];
      const last = beats[beats.length - 1];
      const up = snap.uptime.get(monitorId) ?? {};
      const cert = snap.cert.get(monitorId);
      const active = monitor ? monitor.active !== false : true;

      // down duration of the most recent finished outage
      let lastDownStart: string | null = null;
      let lastDownDuration: number | null = null;
      for (let i = beats.length - 1; i >= 0; i--) {
        if (Number(beats[i].status) === 0) {
          let j = i;
          while (j >= 0 && Number(beats[j].status) === 0) j--;
          const start = beats[j + 1]?.time;
          const end = beats[i + 1]?.time ?? beats[i]?.time;
          if (start) {
            lastDownStart = new Date(start).toISOString();
            lastDownDuration = Math.max(
              0,
              Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000),
            );
          }
          break;
        }
      }

      await supabaseAdmin.from("kuma_monitor_status").upsert(
        {
          server_id: srv.id,
          kind,
          monitor_id: monitorId,
          status: statusFromBeat(active, last),
          active,
          uptime_24h: up["24"] != null ? Number(up["24"]) * 100 : null,
          uptime_30d: up["720"] != null ? Number(up["720"]) * 100 : null,
          latency_ms: last?.ping != null ? Math.round(Number(last.ping)) : null,
          avg_latency_ms: snap.avgPing.has(monitorId)
            ? Math.round(Number(snap.avgPing.get(monitorId)))
            : null,
          last_check_at: last?.time ? new Date(last.time).toISOString() : null,
          last_down_started_at: lastDownStart,
          last_down_duration_s: lastDownDuration,
          cert_days_remaining: cert?.certInfo?.daysRemaining ?? cert?.daysRemaining ?? null,
          cert_expires_at: cert?.certInfo?.validTo ?? cert?.validTo ?? null,
          message: last?.msg ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "server_id,kind" },
      );

      // store recent heartbeats (dedup by timestamp)
      const recent = beats.slice(-40);
      if (recent.length) {
        const { data: lastStored } = await supabaseAdmin
          .from("kuma_heartbeats")
          .select("checked_at")
          .eq("server_id", srv.id)
          .eq("kind", kind)
          .order("checked_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const cutoff = lastStored?.checked_at ? new Date(lastStored.checked_at).getTime() : 0;
        const rows = recent
          .filter((b: any) => b.time && new Date(b.time).getTime() > cutoff)
          .map((b: any) => ({
            server_id: srv.id,
            kind,
            ok: Number(b.status) === 1,
            latency_ms: b.ping != null ? Math.round(Number(b.ping)) : null,
            message: b.msg ?? null,
            checked_at: new Date(b.time).toISOString(),
          }));
        if (rows.length) await supabaseAdmin.from("kuma_heartbeats").insert(rows);
      }

      // incident tracking
      const isDown = statusFromBeat(active, last) === "down";
      const { data: openInc } = await supabaseAdmin
        .from("kuma_incidents")
        .select("id, started_at")
        .eq("server_id", srv.id)
        .eq("kind", kind)
        .is("ended_at", null)
        .maybeSingle();
      if (isDown && !openInc) {
        await supabaseAdmin.from("kuma_incidents").insert({
          server_id: srv.id,
          kind,
          started_at: last?.time ? new Date(last.time).toISOString() : new Date().toISOString(),
          reason: last?.msg ?? "Indisponível",
        });
      } else if (!isDown && openInc) {
        const now = Date.now();
        await supabaseAdmin
          .from("kuma_incidents")
          .update({
            ended_at: new Date(now).toISOString(),
            duration_s: Math.max(0, Math.round((now - new Date(openInc.started_at).getTime()) / 1000)),
          })
          .eq("id", openInc.id);
      }

      synced++;
    }
  }

  return { synced };
}

/** Creates missing monitors for every enabled server that isn't linked yet. */
export async function provisionPendingServers(limit = 5) {
  const cfg = kumaConfig();
  if (!cfg.configured) return { provisioned: 0, skipped: true as const };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: servers } = await supabaseAdmin
    .from("servers")
    .select("id, name, host, kuma_tcp_port, iptv_username, iptv_password, kuma_http_id")
    .eq("kuma_enabled", true)
    .is("kuma_http_id", null)
    .limit(limit);
  let provisioned = 0;
  for (const srv of servers ?? []) {
    try {
      const { getIptvCredentials } = await import("./iptv-credentials.server");
      const creds = await getIptvCredentials(srv.id);
      const created = await ensureMonitors(
        { ...(srv as any), iptv_username: creds.username, iptv_password: creds.password },
        {},
      );
      const patch: Record<string, any> = { kuma_synced_at: new Date().toISOString(), kuma_error: null };
      for (const [kind, id] of Object.entries(created)) patch[KUMA_ID_COLUMN[kind as KumaKind]] = id;
      await supabaseAdmin.from("servers").update(patch as never).eq("id", srv.id);
      provisioned++;
    } catch (e: any) {
      await supabaseAdmin
        .from("servers")
        .update({ kuma_error: String(e?.message ?? e).slice(0, 300) })
        .eq("id", srv.id);
    }
  }
  return { provisioned };
}
