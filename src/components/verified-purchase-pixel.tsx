import {useEffect} from "react";
import {useServerFn} from "@tanstack/react-start";
import {getRecentConfirmedPurchases} from "@/lib/meta-conversions.functions";
import {trackMetaPurchase} from "@/lib/meta-pixel";
import {readChoice,onConsentChange} from "@/lib/consent";

/** Browser receives no payment amount until authenticated server confirms it.
 * No polling or tracking when the user has refused advertising cookies.
 */
export function VerifiedPurchasePixel(){
  const verified=useServerFn(getRecentConfirmedPurchases);
  useEffect(()=>{
    let mounted=true;
    let busy=false;
    const check=async()=>{
      if(!mounted||busy||readChoice("advertising")!=="granted")return;
      busy=true;
      try{
        const purchases=await verified();
        if(!mounted||readChoice("advertising")!=="granted")return;
        for(const p of purchases){
          await trackMetaPurchase(p.id,p.amountCents,p.currency);
        }
      }catch{ /* Purchase reconciliation never blocks the customer experience. */ }
      finally{busy=false;}
    };
    void check();
    const stop=onConsentChange(()=>void check());
    const focus=()=>void check();
    window.addEventListener("focus",focus);
    window.addEventListener("streammonitor:payment-confirmed",focus);
    const interval=window.setInterval(()=>void check(),60_000);
    return ()=>{
      mounted=false;stop();window.clearInterval(interval);
      window.removeEventListener("focus",focus);
      window.removeEventListener("streammonitor:payment-confirmed",focus);
    };
  },[verified]);
  return null;
}
