import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";

const PUBLIC_EDGE_STATUS = "https://streammonitor-edge-status-read.victorsampaio133.workers.dev/summary";

// This is a SANITIZED, public-homepage-only availability report. No Cloudflare
// credentials or production database connections are used in this integration.
const reportSchema = z.object({
  source:z.literal("CLOUDFLARE_EDGE_INDEPENDENT"),
  target:z.literal("streammonitor.site"),
  scope:z.literal("public_homepage_only"),
  last:z.object({
    at:z.string().datetime(),
    online:z.boolean(),
    http_status:z.number().int().nullable(),
    latency_ms:z.number().int().min(0).max(30000),
    error_kind:z.string().nullable(),
  }).nullable(),
  last24h:z.object({
    total:z.number().int().nonnegative(),
    succeeded:z.number().int().nonnegative(),
    average_latency_ms:z.number().nullable(),
  }),
});
export type CloudflareEdgeHeartbeat = z.infer<typeof reportSchema>;

/** Only an authenticated admin can read this summary through the Stream Monitor UI. */
export const getCloudflareEdgeHeartbeat=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async ({context}):Promise<CloudflareEdgeHeartbeat>=>{
    const {data:isAdmin,error}=await context.supabase.rpc("has_role",{
      _user_id:context.userId,_role:"admin",
    });
    if(error||isAdmin!==true)throw new Error("Acesso restrito ao administrador.");
    const response=await fetch(PUBLIC_EDGE_STATUS,{
      method:"GET",headers:{Accept:"application/json"},
      signal:AbortSignal.timeout(7000),cache:"no-store",
    });
    if(!response.ok)throw new Error("O resumo independente da Cloudflare não respondeu.");
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.toLowerCase().includes("application/json"))
      throw new Error("Resposta inválida do monitoramento Cloudflare.");
    return reportSchema.parse(await response.json());
  });
