import {createFileRoute,redirect} from "@tanstack/react-router";
import {supabase} from "@/integrations/supabase/client";
import {isAdminMaster} from "@/lib/permissions";
import {CinematicStudio} from "@/components/vitrine/cinematic-studio";

export const Route=createFileRoute("/_authenticated/vitrine-video")({
  ssr:false,
  beforeLoad:async()=>{
    const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)throw redirect({to:"/auth"});
    if(isAdminMaster(user.email))return;
    const {data:admin,error:roleError}=await supabase.rpc("has_role",{
      _user_id:user.id,_role:"admin",
    });
    if(roleError||admin!==true)throw redirect({to:"/app"});
  },
  component:()=> <CinematicStudio mode="video"/>,
  head:()=>({meta:[
    {title:"Vitrine Vídeo MP4 · Admin | Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
});
