import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const broadcastVitrineFootballLaunch=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((raw:unknown)=>z.object({
    photos:z.array(z.string().min(1000).max(4_300_000)).length(3)
  }).parse(raw))
  .handler(async({data,context})=>{
    const {data:isAdmin,error}=await context.supabase.rpc("has_role",{
      _user_id:context.userId,_role:"admin"
    });
    if(error||isAdmin!==true)throw new Error("Envio disponível apenas para administradores.");
    const {broadcastFootballLaunchAlbum}=await import("./telegram-football-launch.server");
    return broadcastFootballLaunchAlbum(data.photos);
  });
