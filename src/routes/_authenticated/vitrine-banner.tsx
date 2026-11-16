import {PremiumVitrineGate} from "@/components/vitrine/premium-vitrine-gate";
import {createFileRoute} from "@tanstack/react-router";
import {CinematicStudio} from "@/components/vitrine/cinematic-studio";

/**
 * Premium static cinematic Banner for any signed-in Stream Monitor account.
 * This route is already inside /_authenticated, and the Banner-only server
 * functions return the user's own reseller branding. No MP4 tools are shown.
 * The separate /vitrine-video route keeps its ADMIN restriction.
 */
export const Route=createFileRoute("/_authenticated/vitrine-banner")({
  ssr:false,
  component:()=> <PremiumVitrineGate><CinematicStudio mode="banner"/></PremiumVitrineGate>,
  head:()=>({meta:[
    {title:"Vitrine Banner Cinematográfica | Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
});
