/** Globalping independent confirmation. Never treat DNS success as proof that IPTV works. */
export type WorldProbe = { country: string; verdict: "ok" | "down" | "unknown" };
export type WorldVerdict = "dns_resolves" | "dns_failure_confirmed" | "regional_failure" | "inconclusive";
const REGIONS = ["BR", "US", "DE"] as const;
export function classifyWorldDns(probes: WorldProbe[]): WorldVerdict {
  const byCountry = new Map<string, Set<string>>();
  for (const p of probes) {
    if (!REGIONS.includes(p.country as typeof REGIONS[number])) continue;
    const values = byCountry.get(p.country) ?? new Set<string>();
    values.add(p.verdict); byCountry.set(p.country, values);
  }
  const votes = [...byCountry.values()].map(s => s.size === 1 ? [...s][0] : "unknown");
  const ok = votes.filter(v => v === "ok").length;
  const down = votes.filter(v => v === "down").length;
  if (ok >= 2) return "dns_resolves";
  if (down >= 2 && ok === 0) return "dns_failure_confirmed";
  if (ok && down) return "regional_failure";
  return "inconclusive";
}
export function shouldRequestGlobalping(input: { consecutiveFailures: number; lastWorldCheckAt?: number; now: number; paused: boolean; eligible: boolean }): boolean {
  return input.eligible && !input.paused && input.consecutiveFailures >= 2 &&
    (!input.lastWorldCheckAt || input.now - input.lastWorldCheckAt >= 15 * 60_000);
}
export async function requestWorldDns(target: string, token: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(target))
    throw new Error("invalid_public_hostname");
  if (!token) throw new Error("missing_globalping_token");
  const response = await fetcher("https://api.globalping.io/v1/measurements", {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "StreamMonitor/1.0 (https://streammonitor.site)" },
    body: JSON.stringify({ type: "dns", target, locations: REGIONS.map(country => ({country, limit: 1})), measurementOptions: {query: {type:"A"}} }),
  });
  if (response.status === 429) throw new Error("globalping_rate_limited");
  if (!response.ok) throw new Error("globalping_unavailable");
  const data = await response.json() as { id?: unknown };
  if (typeof data.id !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(data.id)) throw new Error("invalid_measurement_id");
  return data.id;
}
