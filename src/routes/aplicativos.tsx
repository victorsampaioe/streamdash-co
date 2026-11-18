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
      <div className="flex items-center gap-3">
       <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
        {app.logoUrl?<img src={app.logoUrl} className="h-full w-full object-contain" alt=""/>:<Smartphone size={23}/>}
       </div>
       <div><h2 className="font-bold">{app.name}</h2>
        <p className={"flex items-center gap-1 text-xs font-semibold "+x.color}><Icon size={13}/>{x.label}</p>
       </div>
      </div>
      <p className="text-xs leading-6 text-slate-300">{x.text}</p>
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
