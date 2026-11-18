/**
 * Pesquisa somente metadados do catálogo reconhecido; nunca entrega credenciais.
 */
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {isServiceActive} from "@/lib/service-status.server";
import {titleKey} from "@/lib/iptv-catalog.server";
import {rateLimit} from "@/lib/api-security.server";

export type CatalogMediaKind="all"|"vod"|"series"|"live";
export type SearchableServer={id:string;name:string;catalogSyncedAt:string};
export type CatalogSearchResult={
 server:SearchableServer;query:string;kind:CatalogMediaKind;
 status:"found"|"not_listed";stale:boolean;
 items:Array<{id:number;name:string;kind:"vod"|"series"|"live";category:string|null}>;
 limited:boolean;
};
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const selectable=(s:any)=>!!s?.catalog_synced_at &&
  !!s?.iptv_username && !!s?.iptv_password &&
  (s.iptv_detected==="xtream"||s.iptv_detected==="both") &&
  !s.monitoring_paused;
function normQuery(query:string){
 const raw=String(query||"").trim().replace(/\s+/g," ");
 const key=titleKey(raw);
 if(raw.length<2||raw.length>120||key.length<2)throw new Error("Digite pelo menos dois caracteres do título.");
 return {raw,key};
}
export async function listCatalogServers(ownerId:string):Promise<SearchableServer[]>{
 if(!ID.test(ownerId)||!(await isServiceActive(ownerId)))return [];
 const {data,error}=await supabaseAdmin.from("servers")
  .select("id,name,iptv_detected,iptv_username,iptv_password,catalog_synced_at,monitoring_paused")
  .eq("owner_id",ownerId).not("catalog_synced_at","is",null)
  .in("iptv_detected",["xtream","both"]).order("name").limit(300);
 if(error)throw new Error("Não foi possível carregar seus servidores.");
 return (data||[]).filter(selectable).map(s=>({
  id:s.id,name:String(s.name).slice(0,95),catalogSyncedAt:String(s.catalog_synced_at)
 }));
}
export async function searchCatalogForOwner(
 ownerId:string,serverId:string,query:string,kind:CatalogMediaKind="all"
):Promise<CatalogSearchResult>{
 if(!ID.test(serverId))throw new Error("Servidor inválido.");
 if(!["all","vod","series","live"].includes(kind))throw new Error("Filtro inválido.");
 const {raw,key}=normQuery(query);
 const limiter=await rateLimit({bucket:"catalog_search",limit:35,windowSeconds:60},ownerId);
 if(!limiter.allowed)throw new Error("Muitas pesquisas. Tente novamente em um minuto.");
 const servers=await listCatalogServers(ownerId);
 const server=servers.find(s=>s.id===serverId);
 if(!server)throw new Error("Servidor indisponível, sem autorização ou sem catálogo reconhecido.");
 let q=supabaseAdmin.from("iptv_catalog_items")
  .select("id,name,kind,category")
  .eq("server_id",serverId).is("removed_at",null)
  .ilike("title_key","%"+key+"%");
 if(kind==="all")q=q.in("kind",["vod","series","live"]);
 else q=q.eq("kind",kind);
 const {data,error}=await q.limit(16);
 if(error)throw new Error("Não foi possível consultar o catálogo deste servidor.");
 const items=(data||[]).slice(0,15).map(x=>({
  id:Number(x.id),name:String(x.name).slice(0,180),
  kind:x.kind as "vod"|"series"|"live",category:x.category||null
 }));
 const stale=Date.now()-new Date(server.catalogSyncedAt).getTime()>24*60*60*1000;
 return {server,query:raw,kind,status:items.length?"found":"not_listed",
  stale,items,limited:(data||[]).length>15};
}
