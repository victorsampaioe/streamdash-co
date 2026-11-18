/**
 * Opt-in Xtream get_series_info request for one already-recognized series.
 * No automatic scans, no videos, no credential exposure, no stored episodes.
 */
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {getIptvCredentials, checkLoginGuard} from "@/lib/iptv-credentials.server";
import {rateLimit} from "@/lib/api-security.server";
import {validateOutboundUrl} from "@/lib/ssrf-guard";
import {listCatalogServers} from "@/lib/server-catalog-search.server";
import {parseSeriesEpisodes} from "@/lib/series-episodes";
import type {SeriesEpisodeSummary} from "@/lib/series-episodes";

export type SeriesDetailsResult = SeriesEpisodeSummary & {
  series: {id:number;name:string};
  cached:boolean;
};
const MAX_RESPONSE_BYTES=4*1024*1024;
const CACHE_MS=10*60_000;
const cache=new Map<string,{until:number;value:SeriesDetailsResult}>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A single bounded JSON request. Never log the URL (it has Xtream credentials). */
async function readProviderJson(url:URL):Promise<unknown> {
  const response=await fetch(url,{
    method:"GET",
    redirect:"error",
    signal:AbortSignal.timeout(12_000),
    cache:"no-store",
    headers:{Accept:"application/json, text/plain;q=0.9", "User-Agent":"StreamMonitorCatalog/1.0"},
  });
  if(!response.ok)throw new Error("O provedor não autorizou ou não respondeu à consulta de episódios.");
  const length=Number(response.headers.get("content-length")||0);
  if(length>MAX_RESPONSE_BYTES)throw new Error("A lista de episódios é grande demais para consulta rápida.");
  if(!response.body)throw new Error("O provedor não retornou uma lista de episódios.");
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let text="";
  let bytes=0;
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value?.byteLength||0;
      if(bytes>MAX_RESPONSE_BYTES)throw new Error("A lista de episódios é grande demais para consulta rápida.");
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
  }finally{
    try{await reader.cancel();}catch{/** Response already complete. */}
  }
  if(!text.trim())throw new Error("O provedor retornou uma resposta vazia.");
  try{return JSON.parse(text);}catch{throw new Error("O provedor não retornou os episódios em formato compatível.");}
}

export async function getSeriesDetailsForOwner(
  ownerId:string, serverId:string, itemId:number
):Promise<SeriesDetailsResult>{
  if(!UUID.test(ownerId)||!UUID.test(serverId)||!Number.isSafeInteger(itemId)||itemId<=0)
    throw new Error("Série ou servidor inválido.");

  // Check subscription, current ownership, monitored Xtream credentials and
  // the last accepted login at every call, including cached results.
  const eligible=await listCatalogServers(ownerId);
  if(!eligible.some(s=>s.id===serverId))
    throw new Error("Servidor não autorizado, inativo ou sem catálogo reconhecido.");

  const {data:item,error:itemError}=await supabaseAdmin.from("iptv_catalog_items")
    .select("id,name,external_id")
    .eq("server_id",serverId).eq("id",itemId).eq("kind","series")
    .is("removed_at",null).maybeSingle();
  if(itemError||!item)throw new Error("Série não encontrada no catálogo autorizado.");
  const seriesId=String(item.external_id||"");
  if(!/^[0-9]{1,12}$/.test(seriesId))
    throw new Error("Este provedor não forneceu um ID de série compatível.");

  const limiter=await rateLimit({bucket:"catalog_series_details",limit:8,windowSeconds:60},ownerId);
  if(!limiter.allowed)throw new Error("Limite de consultas de episódios atingido. Aguarde um minuto.");
  const cacheKey=ownerId+":"+serverId+":"+seriesId;
  const prev=cache.get(cacheKey);
  if(prev&&prev.until>Date.now())return {...prev.value,cached:true};

  const secondary=await rateLimit({bucket:"catalog_series_server",limit:30,windowSeconds:600},serverId);
  if(!secondary.allowed)throw new Error("Muitas consultas a este servidor. Tente novamente mais tarde.");
  const {data:server,error:serverError}=await supabaseAdmin.from("servers")
    .select("host").eq("id",serverId).eq("owner_id",ownerId).maybeSingle();
  if(serverError||!server?.host)throw new Error("Servidor não disponível.");
  const verdict=validateOutboundUrl(server.host);
  if(!verdict.safe)throw new Error("O endereço do servidor não permite esta consulta segura.");
  const guard=await checkLoginGuard(serverId);
  if(!guard.allowed)throw new Error("As credenciais deste servidor estão temporariamente bloqueadas.");

  const {username,password}=await getIptvCredentials(serverId);
  if(!username||!password)throw new Error("Credenciais Xtream não cadastradas para este servidor.");

  // Exactly one provider action for a single series, never get_series (full list).
  const endpoint=new URL("/player_api.php",verdict.url);
  endpoint.searchParams.set("username",username);
  endpoint.searchParams.set("password",password);
  endpoint.searchParams.set("action","get_series_info");
  endpoint.searchParams.set("series_id",seriesId);
  let raw:unknown;
  try {
    raw=await readProviderJson(endpoint);
  }catch(e){
    // Never propagate a low-level fetch error including the credential URL.
    if(e instanceof Error && /^O provedor|^A lista de episódios/.test(e.message))throw e;
    throw new Error("Não foi possível consultar os episódios deste servidor. Tente novamente.");
  }
  const parsed=parseSeriesEpisodes(raw);
  const value:SeriesDetailsResult={
    ...parsed,series:{id:itemId,name:String(item.name).slice(0,180)},cached:false,
  };
  if(cache.size>200)cache.clear();
  cache.set(cacheKey,{until:Date.now()+CACHE_MS,value});
  return value;
}
