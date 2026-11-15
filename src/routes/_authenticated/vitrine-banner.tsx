import {createFileRoute} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {isAdminMaster} from "@/lib/permissions";
import {VitrineStudio} from "@/components/vitrine/vitrine-studio";
import {CinematicStudio} from "@/components/vitrine/cinematic-studio";

export const Route=createFileRoute("/_authenticated/vitrine-banner")({
  ssr:false,
  component:VitrineBannerWithPremium,
  head:()=>({meta:[
    {title:"Vitrine Banner | Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
});

function VitrineBannerWithPremium(){
  const [admin,setAdmin]=useState(false);
  const [mode,setMode]=useState<"classic"|"cinematic">("classic");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return;
      if(isAdminMaster(user.email)){if(active)setAdmin(true);return;}
      const {data,error}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
      if(active)setAdmin(!error&&data===true);
    })();
    return()=>{active=false;};
  },[]);
  return <div className="min-h-screen bg-background text-foreground">
    {admin&&<div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
      <p className="text-sm font-semibold text-blue-300">Modelos de Vitrine Banner · Administração</p>
      <div className="flex gap-2">
        <button type="button" onClick={()=>setMode("classic")}
          className={"rounded-xl border px-4 py-2 text-sm font-bold "+(mode==="classic"?"border-blue-400 bg-blue-600 text-white":"border-border bg-card")}>
          Modelos existentes
        </button>
        <button type="button" onClick={()=>setMode("cinematic")}
          className={"rounded-xl border px-4 py-2 text-sm font-bold "+(mode==="cinematic"?"border-blue-400 bg-blue-600 text-white":"border-border bg-card")}>
          Novo Cinematográfico
        </button>
      </div>
    </div>}
    {admin&&mode==="cinematic"?<CinematicStudio mode="banner"/>:<VitrineStudio mode="banner"/>}
  </div>;
}
