import {createFileRoute} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useQuery} from "@tanstack/react-query";
import {Activity,AlertTriangle,CheckCircle2,Clock,Smartphone,ShieldCheck} from "lucide-react";
import {Card} from "@/components/ui/card";
import {getPublicAppStatuses} from "@/lib/app-partners.functions";

export const Route=createFileRoute("/aplicativos")({
 component:PublicAppStatuses,
 head:()=>({meta:[
  {title:"Monitoramento de Aplicativos | Stream Monitor"},
  {name:"description",content:"Consulte os estados verificados dos aplicativos integrados ao Stream Monitor."}
 ]})
});
const info={
 online:{label:"Online",icon:CheckCircle2,color:"text-emerald-400",text:"A API oficial indicou funcionamento normal"},
 degraded:{label:"Instabilidade",icon:AlertTriangle,color:"text-amber-400",text:"A API oficial informou degradação em seus serviços"},
 offline:{label:"Offline",icon:AlertTriangle,color:"text-red-400",text:"A API oficial informou indisponibilidade"},
 unknown:{label:"Não confirmado",icon:Clock,color:"text-slate-400",text:"Não há evidência suficiente para confirmar o estado atual"},
 unverified:{label:"Aguardando integração",icon:Clock,color:"text-slate-400",text:"Monitoramento ainda está em validação técnica"}
};
function PublicAppStatuses(){
 const get=useServerFn(getPublicAppStatuses);
 const {data,error,isLoading}=useQuery({queryKey:["public-app-statuses"],queryFn:()=>get(),refetchInterval:90000,staleTime:30000});
 return <div className="min-h-screen bg-[#081426] px-4 py-8 text-white sm:px-6">
  <div className="mx-auto max-w-5xl space-y-7">
   <a href="/" className="inline-flex items-center gap-2 text-lg font-extrabold"><Activity className="text-blue-400"/>Stream Monitor</a>
   <header className="space-y-4 rounded-3xl border border-blue-500/20 bg-gradient-to-br from-[#13356b] to-[#0d1b32] p-6 sm:p-9">
    <p className="text-xs font-extrabold uppercase tracking-widest text-blue-300">Central pública</p>
    <h1 className="text-3xl font-extrabold sm:text-4xl">Monitoramento de aplicativos</h1>
    <p className="max-w-3xl text-sm leading-7 text-slate-300">
     Acompanhe os serviços declarados pelas APIs oficiais dos aplicativos parceiros. A saúde da API não comprova que todo o aplicativo ou o servidor IPTV do revendedor esteja funcionando.
    </p>
   </header>
   {isLoading&&<p className="text-sm text-slate-300">Consultando aplicativos…</p>}
   {error&&<Card className="rounded-2xl p-5 text-sm text-destructive">Não foi possível carregar os indicadores agora.</Card>}
   <div className="grid gap-4 sm:grid-cols-2">
    {data?.map(app=>{
     const x=info[(app.status as keyof typeof info)]||info.unknown;
     const Icon=x.icon;
     return <div key={app.slug} className="space-y-3 rounded-2xl border border-blue-400/15 bg-[#121f37] p-5">
      <div className="flex flex-wrap items-center gap-3">
       <div className="flex h-[82px] w-[126px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-300/20 bg-[#0b1024] p-1.5 text-blue-300 sm:h-[94px] sm:w-[142px]">
        {app.logoUrl?<img src={app.logoUrl} width={500} height={300} loading="lazy" className="h-full w-full object-contain" alt={"Logo oficial "+app.name}/>:<Smartphone size={31}/>}
       </div>
       <div className="min-w-0 flex-1"><h2 className="text-lg font-extrabold">{app.name}</h2>
        <p className={"mt-1 flex items-center gap-1.5 text-xs font-semibold "+x.color}><Icon size={14}/>{x.label}</p>
        <span className="mt-2 inline-flex rounded-md border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-200">Parceiro integrado</span>
       </div>
      </div>
            <p className="text-xs leading-6 text-slate-300">{x.text}</p>
      {app.stability30d!==null&&<div className="flex flex-wrap gap-2 text-[11px]">
       <span className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-2.5 py-1.5">Estabilidade informada · 30 dias: <b>{Number(app.stability30d).toFixed(1)}%</b></span>
       {app.incidents30d!==null&&<span className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-2.5 py-1.5">Incidentes informados: <b>{app.incidents30d}</b></span>}
      </div>}
      {app.services.length>0&&<div className="space-y-2 rounded-xl border border-blue-400/10 bg-white/[0.03] p-3">
       <p className="text-xs font-semibold text-blue-200">Serviços acompanhados</p>
       {app.services.map(service=>{
        const st=info[(service.status as keyof typeof info)]||info.unknown;
        return <div key={service.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
         <span className="text-slate-200">{service.name}</span>
         <div className="flex items-center gap-2">
          <span className={st.color}>{st.label}</span>
          {service.uptime30d!==null&&<span className="text-slate-400">{Number(service.uptime30d).toFixed(1)}% · 30d</span>}
         </div>
        </div>;
       })}
      </div>}
      <p className="text-[11px] text-slate-400">{app.lastCheckAt?"Última observação: "+new Date(app.lastCheckAt).toLocaleString("pt-BR"):"Aguardando primeira verificação oficial"}</p>
     </div>;
    })}
   </div>
   <div className="flex items-start gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 text-xs leading-6 text-slate-300">
    <ShieldCheck className="mt-1 shrink-0 text-blue-300"/><p>Os estados são exibidos somente quando a API do parceiro fornece evidências interpretáveis. Falha de um único endpoint não é prova de queda generalizada. Alertas de recuperação exigem confirmação posterior.</p>
   </div>
  </div>
 </div>;
}
