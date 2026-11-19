/** Read-only automatic Globalping reconciliation. Never updates live server state or sends alerts. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyWorldDns, requestWorldDns, type WorldProbe } from "./globalping-auto-confirm.server";

const db = supabaseAdmin as any;
const COUNTRY = new Set(["BR", "US", "DE"]);
function hostname(raw: string): string | null {
  try {
    const url = new URL(raw.startsWith("https://") || raw.startsWith("http://") ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    return url.username || url.password || !/^[a-z0-9.-]{4,253}$/.test(host) || !host.includes(".") ||
      host.endsWith(".local") || host.endsWith(".localhost") ? null : host;
  } catch { return null; }
}
export async function runAutomaticGlobalpingConfirmation(maxNew = 1): Promise<{started:number;completed:number;errors:number}> {
  const result = {started:0,completed:0,errors:0};
  const {data: token, error: tokenError} = await db.rpc("streammonitor_globalping_token_server_only");
  if (tokenError || typeof token !== "string" || !token) return result;
  // Read and finish outstanding measurements first, before consuming any new quota.
  const {data: pending} = await db.from("globalping_auto_confirmations")
    .select("id,measurement_id,server_id,created_at").eq("status","pending").limit(5);
  for (const item of pending ?? []) {
    try {
      if (Date.now() - Date.parse(item.created_at) > 180_000) {
        await db.from("globalping_auto_confirmations").update({status:"unknown",verdict:"inconclusive"}).eq("id",item.id).eq("status","pending");
        continue;
      }
      const response = await fetch(`https://api.globalping.io/v1/measurements/${encodeURIComponent(item.measurement_id)}`,
        {headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},signal:AbortSignal.timeout(10000)});
      if (!response.ok) continue;
      const payload = await response.json() as any;
      if (payload.status !== "finished") continue;
      const probes: WorldProbe[] = (payload.results ?? []).filter((x:any)=>COUNTRY.has(x.probe?.country)).map((x:any)=>({
        country:x.probe.country,
        verdict:x.result?.status !== "finished" ? "unknown" : x.result?.statusCode === 0 &&
          (x.result?.answers ?? []).some((a:any)=>a.type === "A" && typeof a.value === "string") ? "ok" :
          [2,3].includes(x.result?.statusCode) ? "down" : "unknown",
      }));
      await db.from("globalping_auto_confirmations").update({status:"finished",verdict:classifyWorldDns(probes),probes,finished_at:new Date().toISOString()})
        .eq("id",item.id).eq("status","pending");
      result.completed++;
    } catch { result.errors++; }
  }
  // Global daily cap prevents exhausting the shared manual Radar quota.
  const since = new Date(Date.now()-86_400_000).toISOString();
  const {count} = await db.from("globalping_auto_confirmations").select("id",{count:"exact",head:true}).gte("created_at",since);
  if ((count ?? 0) >= 12) return result;
  const {data: servers} = await db.from("servers")
    .select("id,host,consecutive_failures").eq("monitoring_paused",false)
    .gte("consecutive_failures",2).order("consecutive_failures",{ascending:false}).limit(20);
  for (const server of servers ?? []) {
    if (result.started >= Math.min(2,Math.max(0,maxNew)) || (count ?? 0)+result.started >= 12) break;
    const target = hostname(String(server.host ?? ""));
    if (!target) continue;
    const {data: recent} = await db.from("globalping_auto_confirmations").select("id").eq("server_id",server.id)
      .gte("created_at",new Date(Date.now()-15*60_000).toISOString()).limit(1);
    if (recent?.length) continue;
    try {
      const measurementId = await requestWorldDns(target,token);
      const {error} = await db.from("globalping_auto_confirmations").insert({server_id:server.id,target_host:target,
        measurement_id:measurementId,status:"pending",verdict:"inconclusive"});
      if (error) result.errors++; else result.started++;
    } catch(e) {
      result.errors++;
      if (e instanceof Error && e.message === "globalping_rate_limited") break;
    }
  }
  return result;
}
