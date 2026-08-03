import { createHmac, timingSafeEqual } from "node:crypto";

export type RegionAgent = {
  id: string;
  region_code: string;
  name: string;
  secret_hash: string;
  enabled: boolean;
};

function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  try { return timingSafeEqual(x, y); } catch { return false; }
}

/**
 * Autentica um agente (VPS) por HMAC-SHA256 do corpo bruto usando a chave do agente.
 * Header: x-agent-id (uuid) + x-signature (hex).
 */
export async function authenticateAgent(
  agentId: string | null,
  message: string,
  signature: string | null,
): Promise<RegionAgent | null> {
  if (!agentId || !signature) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("region_agents")
    .select("id, region_code, name, secret_hash, enabled")
    .eq("id", agentId)
    .maybeSingle();
  const agent = data as RegionAgent | null;
  if (!agent || !agent.enabled) return null;
  const expected = createHmac("sha256", agent.secret_hash).update(message).digest("hex");
  const given = signature.trim().toLowerCase().replace(/^sha256=/, "");
  if (!safeEqualHex(given, expected)) return null;
  return agent;
}

export async function touchAgent(agentId: string, count: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("region_agents")
    .update({ last_seen_at: new Date().toISOString(), last_report_count: count })
    .eq("id", agentId);
}
