import {readChoice} from "@/lib/consent";
import {captureAttribution,readAttribution} from "@/lib/ad-attribution";

const counted=new Set<string>();
/** First-party funnel stage, only for consented browser sessions.
 * No IP, email, hostname, raw click identifiers or persistent visitor IDs.
 */
export async function trackAcquisitionPage(stage:"landing"|"signup"){
 if(typeof window==="undefined"||readChoice("advertising")!=="granted")return;
 // Synthetic browser automation is useful for QA but is not a real visitor.
 if(navigator.webdriver===true)return;
 captureAttribution();
 const attribution=readAttribution();
 if(!attribution)return;
 const key=stage+"|"+window.location.pathname+"|"+window.location.search;
 if(counted.has(key))return;
 counted.add(key);
 try{
  const response=await fetch("/api/public/acquisition/visit",{
   method:"POST",headers:{"content-type":"application/json"},
   credentials:"same-origin",
   body:JSON.stringify({event_id:crypto.randomUUID(),stage,attribution}),
   keepalive:true
  });
  if(!response.ok)counted.delete(key);
 }catch{counted.delete(key);}
}
