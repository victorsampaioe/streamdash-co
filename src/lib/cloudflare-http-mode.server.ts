import {supabaseAdmin} from "@/integrations/supabase/client.server";

/** Cloudflare is the primary HTTP checker. Never fall back to the removed AWS core. */
export async function isCloudflareHttpPrimary():Promise<boolean>{
  const {data,error}=await supabaseAdmin.from("app_settings")
    .select("value").eq("key","cf_http_primary").maybeSingle();
  // If the switch cannot be read, do not start the obsolete AWS probe cycle.
  if(error)return true;
  return (data?.value as {mode?:string}|null)?.mode!=="legacy";
}
