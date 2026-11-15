import {createFileRoute} from "@tanstack/react-router";
import {VitrineStudio} from "@/components/vitrine/vitrine-studio";

/**
 * Vitrine Banner remains the ORIGINAL standalone banner studio.
 * The cinematic trailer editor is only on /vitrine-video.
 * Never mix video-specific options into the existing reseller banner models.
 */
export const Route=createFileRoute("/_authenticated/vitrine-banner")({
  ssr:false,
  component:()=> <VitrineStudio mode="banner"/>,
  head:()=>({meta:[
    {title:"Vitrine Banner | Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
});
