import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getKumaStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string; hours?: number }) =>
    z.object({ serverId: z.string().uuid(), hours: z.number().min(1).max(720).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { kumaConfig } = await import("./kuma.server");
    const since = new Date(Date.now() - (data.hours ?? 24) * 3600_000).toISOString();

    const { data: srv } = await context.supabase
      .from("servers")
      .select(
        "id, name, kuma_enabled, kuma_tcp_port, kuma_synced_at, kuma_error, kuma_http_id, kuma_ping_id, kuma_dns_id, kuma_tcp_id, kuma_api_id, kuma_ssl_id",
      )
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    const [{ data: statuses }, { data: beats }, { data: incidents }, { data: week }] = await Promise.all([
      context.supabase.from("kuma_monitor_status").select("*").eq("server_id", data.serverId),
      context.supabase
        .from("kuma_heartbeats")
        .select("kind, ok, latency_ms, checked_at")
        .eq("server_id", data.serverId)
        .gte("checked_at", since)
        .order("checked_at", { ascending: true })
        .limit(1000),
      context.supabase
        .from("kuma_incidents")
        .select("id, kind, started_at, ended_at, duration_s, reason")
        .eq("server_id", data.serverId)
        .order("started_at", { ascending: false })
        .limit(20),
      context.supabase
        .from("kuma_heartbeats")
        .select("kind, ok")
        .eq("server_id", data.serverId)
        .gte("checked_at", new Date(Date.now() - 7 * 24 * 3600_000).toISOString())
        .limit(5000),
    ]);

    const uptime7d: Record<string, number> = {};
    const agg: Record<string, { ok: number; total: number }> = {};
    for (const b of week ?? []) {
      const a = (agg[b.kind] ??= { ok: 0, total: 0 });
      a.total++;
      if (b.ok) a.ok++;
    }
    for (const [k, a] of Object.entries(agg)) uptime7d[k] = a.total ? (a.ok / a.total) * 100 : 0;

    return {
      configured: kumaConfig().configured,
      server: srv,
      statuses: statuses ?? [],
      beats: beats ?? [],
      incidents: incidents ?? [],
      uptime7d,
    };
  });

export const provisionKumaMonitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string; tcpPort?: number }) =>
    z.object({ serverId: z.string().uuid(), tcpPort: z.number().int().min(1).max(65535).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ensureMonitors, KUMA_ID_COLUMN, kumaConfig } = await import("./kuma.server");
    if (!kumaConfig().configured) throw new Error("Uptime Kuma ainda não está configurado no backend");

    const { data: srv } = await context.supabase
      .from("servers")
      .select(
        "id, name, host, kuma_tcp_port, iptv_username, iptv_password, kuma_http_id, kuma_ping_id, kuma_dns_id, kuma_tcp_id, kuma_api_id, kuma_ssl_id",
      )
      .eq("id", data.serverId)
      .maybeSingle();
    if (!srv) throw new Error("Servidor não encontrado");

    if (data.tcpPort && data.tcpPort !== srv.kuma_tcp_port) {
      await context.supabase.from("servers").update({ kuma_tcp_port: data.tcpPort }).eq("id", srv.id);
      (srv as any).kuma_tcp_port = data.tcpPort;
    }

    const existing: Record<string, number | null> = {};
    for (const [kind, col] of Object.entries(KUMA_ID_COLUMN)) existing[kind] = (srv as any)[col] ?? null;

    try {
      const created = await ensureMonitors(srv as any, existing as any);
      const patch: Record<string, any> = { kuma_synced_at: new Date().toISOString(), kuma_error: null };
      for (const [kind, id] of Object.entries(created)) patch[(KUMA_ID_COLUMN as any)[kind]] = id;
      const { error } = await context.supabase.from("servers").update(patch as never).eq("id", srv.id);
      if (error) throw new Error(error.message);
      return { created: Object.keys(created).length };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      await context.supabase.from("servers").update({ kuma_error: msg }).eq("id", srv.id);
      throw new Error(msg);
    }
  });

export const syncKumaNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { syncKumaStatuses } = await import("./kuma.server");
    return await syncKumaStatuses();
  });

export const setKumaEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { serverId: string; enabled: boolean }) =>
    z.object({ serverId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("servers")
      .update({ kuma_enabled: data.enabled })
      .eq("id", data.serverId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
