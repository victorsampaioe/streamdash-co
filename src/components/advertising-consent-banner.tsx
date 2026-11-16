import {useEffect,useState} from "react";
import {readChoice,needsAnswer,onConsentChange,saveChoices} from "@/lib/consent";

/** Explicit, non-blocking marketing choice. Signing up never depends on it. */
export function AdvertisingConsentBanner(){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    let mounted=true;
    const refresh=()=>void needsAnswer(["advertising"]).then(answer=>{
      if(mounted)setVisible(answer && readChoice("advertising")===null);
    });
    refresh();
    const stop=onConsentChange(refresh);
    return ()=>{mounted=false;stop();};
  },[]);
  if(!visible)return null;
  return <aside role="region" aria-label="Preferências de publicidade"
    className="fixed bottom-3 left-3 right-3 z-[110] mx-auto max-w-2xl rounded-xl border border-blue-500/30 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md">
    <p className="text-sm font-semibold">Sua privacidade importa</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-300">
      Com sua autorização, podemos medir visitas, cadastros e assinaturas em anúncios do Facebook e Instagram.
      Sem autorização, o Meta Pixel fica desligado e você pode usar e criar sua conta normalmente.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" onClick={()=>saveChoices({advertising:"denied"})}
        className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-semibold hover:bg-slate-800">
        Recusar publicidade
      </button>
      <button type="button" onClick={()=>saveChoices({advertising:"granted"})}
        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500">
        Aceitar medição de anúncios
      </button>
      <a href="/privacidade" className="self-center text-xs underline text-slate-300">Política de privacidade</a>
    </div>
  </aside>;
}
