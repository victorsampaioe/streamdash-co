import {createFileRoute} from "@tanstack/react-router";
import {VideoTemplateLibrary} from "@/components/vitrine/video-template-library";
import {PremiumVitrineGate} from "@/components/vitrine/premium-vitrine-gate";

export const Route=createFileRoute("/_authenticated/vitrine-video-modelos")({
  ssr:false,
  component:()=> <PremiumVitrineGate><VideoTemplateLibrary/></PremiumVitrineGate>,
  head:()=>({meta:[
    {title:"Vídeos para sua Revenda | Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"}
  ]})
});
