import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireActiveSubscription} from "@/lib/subscription-guard";

export const listMyCatalogServers=createServerFn({method:"GET"})
 .middleware([requireActiveSubscription])
 .handler(async({context})=>{
  const {listCatalogServers}=await import("@/lib/server-catalog-search.server");
  return listCatalogServers(context.userId);
 });

export const searchMyServerCatalog=createServerFn({method:"POST"})
 .middleware([requireActiveSubscription])
 .inputValidator((input:{serverId:string;query:string;kind?:"all"|"vod"|"series"|"live";authorized:boolean})=>
   z.object({
    serverId:z.string().uuid(),query:z.string().trim().min(2).max(120),
    // Only run a catalog lookup after the reseller explicitly opts in.
    authorized:z.literal(true),
    kind:z.enum(["all","vod","series","live"]).default("all")
   }).parse(input))
 .handler(async({context,data})=>{
  const {searchCatalogForOwner}=await import("@/lib/server-catalog-search.server");
  return searchCatalogForOwner(context.userId,data.serverId,data.query,data.kind);
 });
