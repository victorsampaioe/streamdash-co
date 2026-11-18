import {useEffect,useState} from "react";
import {Link} from "@tanstack/react-router";
import {Bell,ChevronRight,X} from "lucide-react";
import {useSubscription} from "@/hooks/use-subscription";
import {CONVERSION_REMINDER_MESSAGES,getConversionReminderStep} from "@/lib/onboarding-conversion";

type SavedPreference={seen:number[];disabled:boolean;startedAt?:number};
const empty:SavedPreference={seen:[],disabled:false};
function getPreference(key:string):SavedPreference{
  if(typeof window==="undefined")return empty;
  try{
    const raw=window.localStorage.getItem(key);
    if(!raw)return empty;
    const parsed=JSON.parse(raw) as Partial<SavedPreference>;
    return {seen:Array.isArray(parsed.seen)?parsed.seen.filter(n=>Number.isInteger(n)&&n>=1&&n<=5):[],
      disabled:parsed.disabled===true,
      startedAt:typeof parsed.startedAt==="number"&&Number.isFinite(parsed.startedAt)?parsed.startedAt:undefined};
  }catch{return empty;}
}
function savePreference(key:string,value:SavedPreference){
  try{window.localStorage.setItem(key,JSON.stringify(value));}catch{/*private browsing*/}
}

/** Passive, dismissible in-app reminders only. Five hourly windows after
 * signup, never outbound email/Telegram, no overdue backlog, no nagging
 * an active subscriber or a reseller. Clearing account data leaves no PII.
 */
export function ConversionReminders(){
  const {data,isLoading,isError}=useSubscription();
  const userId=data?.profile?.id||"";
  const createdAt=data?.profile?.created_at||"";
  const eligible=!isLoading&&!isError&&!!userId&&!!createdAt&&data?.isActive===false
    &&data?.profile?.is_reseller!==true;
  const key=userId?"streammonitor:conversion-reminders:"+userId:"";
  const [now,setNow]=useState(0);
  const [mounted,setMounted]=useState(false);
  const [startedAt,setStartedAt]=useState<number|null>(null);
  const [,setRevision]=useState(0);
  useEffect(()=>{
    setNow(Date.now());
    setMounted(true);
    const timer=setInterval(()=>setNow(Date.now()),60_000);
    return ()=>clearInterval(timer);
  },[]);
  // Start the sequence on the first dashboard visit for recent signups.
  // People registered earlier today still receive their five opportunities,
  // instead of all five windows having elapsed before they return.
  useEffect(()=>{
    if(!mounted||!eligible||!key)return;
    const age=Date.now()-Date.parse(createdAt);
    if(!Number.isFinite(age)||age<0||age>7*24*60*60_000){
      setStartedAt(null);
      return;
    }
    const existing=getPreference(key);
    const opened=existing.startedAt||Date.now();
    savePreference(key,{...existing,startedAt:opened});
    setStartedAt(opened);
  },[mounted,eligible,key,createdAt]);
  const step=mounted&&eligible&&startedAt!==null
    ?getConversionReminderStep(new Date(startedAt).toISOString(),now):null;
  const preference=key?getPreference(key):empty;
  if(!step||preference.disabled||preference.seen.includes(step))return null;
  const item=CONVERSION_REMINDER_MESSAGES[step-1];
  if(!item)return null;
  const remember=(disabled:boolean)=>{
    savePreference(key,{...preference,seen:[...new Set([...preference.seen,step])],disabled});
    setRevision(v=>v+1);
  };
  return (
    <section aria-label="Novidades e opções de ativação" className="mx-auto w-full max-w-[1720px] px-4 pt-4 sm:px-6 xl:px-10">
      <div className="relative flex flex-col gap-3 rounded-2xl border border-blue-500/35 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 px-4 py-4 pr-10 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-5 sm:pr-12">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300"><Bell size={19}/></span>
          <div className="max-w-2xl">
            <div className="text-[10px] font-extrabold uppercase tracking-[.14em] text-blue-300">Dica Stream Monitor · {step} de 5</div>
            <h2 className="mt-1 text-base font-black">{item.title}</h2>
            <p className="mt-1 text-xs leading-6 text-slate-300 sm:text-sm">{item.message}</p>
            <button type="button" onClick={()=>remember(true)}
              className="mt-2 text-xs text-slate-400 underline-offset-2 hover:text-white hover:underline">Não quero mais estas dicas</button>
          </div>
        </div>
        <Link to="/app/subscription" onClick={()=>remember(false)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500">
          {item.cta}<ChevronRight size={17}/>
        </Link>
        <button type="button" aria-label="Dispensar esta dica" onClick={()=>remember(false)}
          className="absolute right-3 top-3 rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
          <X size={17}/>
        </button>
      </div>
    </section>
  );
}
