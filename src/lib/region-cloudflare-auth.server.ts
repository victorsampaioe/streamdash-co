import { createPublicKey, verify } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Trust only reports signed with the registered Cloudflare Edge public key.
 * Private key never leaves Cloudflare, and no reusable HMAC secret is copied
 * between cloud providers. ECDSA P-256, SHA-256, P1363 encoding.
 */
export async function verifyCloudflareEdgeSignature(
  message: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const { data, error } = await supabaseAdmin.from("app_settings")
    .select("value").eq("key", "cf_edge_public_jwk").maybeSingle();
  if (error || !data?.value) return false;
  try {
    const jwk = data.value as Record<string, unknown>;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || typeof jwk.x !== "string" || typeof jwk.y !== "string")
      return false;
    const key = createPublicKey({ key: jwk as any, format: "jwk" });
    return verify("sha256", Buffer.from(message), { key, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
