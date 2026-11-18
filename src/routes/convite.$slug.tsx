import {createFileRoute} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useQuery} from "@tanstack/react-query";
import {useRef,useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import {toPng} from "html-to-image";
import {Activity,ArrowRight,CheckCircle2,Copy,Download,ShieldCheck,Server,Smartphone,Users} from "lucide-react";
import {getPublicPartner} from "@/lib/app-partners.functions";
import {toast} from "sonner";

export const Route=createFileRoute("/convite/$slug")({
 component:PartnerInvitePage,
 head:()=>({meta:[
  {title:"Parcerias de Aplicativos — Stream Monitor"},
  {name:"description",content:"Monitore seus servidores e receba alertas de aplicativos através do Stream Monitor."}
 ]})
});
function PartnerInvitePage(){
 const {slug}=Route.useParams();
 const getPartner=useServerFn(getPublicPartner);
 const {data:partner,isLoading}=useQuery({
  queryKey:["partner-invite",slug],queryFn:()=>getPartner({data:{slug}}),staleTime:120000
 });
 const shareRef=useRef<HTMLDivElement>(null);
 const [exporting,setExporting]=useState(false);
 const link="https://streammonitor.site/convite/"+encodeURIComponent(slug);
 const registration="/auth?tab=signup&partner="+encodeURIComponent(slug);
 const copy=async()=>{try{await navigator.clipboard.writeText(link);toast.success("Link copiado");}catch{toast.error("Não foi possível copiar");}};
 const download=async()=>{
  if(!shareRef.current||exporting)return;
  setExporting(true);
  try {
   const png=await toPng(shareRef.current,{pixelRatio:2,cacheBust:true,backgroundColor:"#071329"});
   const a=document.createElement("a");a.href=png;a.download="streammonitor-parceria-"+slug+".png";a.click();
  }catch{toast.error("Não foi possível exportar a arte. Tente novamente.");}
  finally{setExporting(false);}
 };
 if(isLoading)return <main className="flex min-h-screen items-center justify-center bg-[#071329] text-blue-100">Carregando convite…</main>;
 if(!partner)return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#071329] p-8 text-white">
  <Activity className="h-10 w-10 text-blue-400"/><h1 className="text-2xl font-bold">Convite indisponível</h1>
  <p className="text-center text-sm text-slate-400">Esta parceria pode ainda não estar ativa.</p>
  <a className="rounded-xl bg-blue-600 px-5 py-3 font-semibold" href="/">Voltar ao Stream Monitor</a>
 </main>;
 return <main className="min-h-screen bg-[#071329] px-4 py-7 text-white sm:px-6">
  <div className="mx-auto max-w-5xl space-y-8">
   <header className="flex items-center justify-between gap-3">
    <a href="/" className="flex items-center gap-2 text-lg font-extrabold"><Activity className="h-6 w-6 text-blue-400"/>stream<span className="-ml-1.5 text-blue-400">monitor</span></a>
    <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-200">Parceria especial</span>
   </header>
   <section className="overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-br from-[#152c57] via-[#111f3a] to-[#0a1224] p-5 shadow-2xl shadow-blue-900/20 sm:p-10">
    <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
     <div className="max-w-2xl space-y-5">
      <p className="text-xs font-bold uppercase tracking-[.24em] text-blue-300">Uma nova forma de acompanhar sua revenda</p>
      <div className="flex flex-wrap items-center gap-3">
       <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-2xl font-extrabold" style={{boxShadow:"0 0 22px "+partner.accent_color+"33"}}>
        {partner.logo_url?<img src={partner.logo_url} alt={partner.name} className="h-full w-full object-contain"/>:<Smartphone size={32} style={{color:partner.accent_color}}/>}
       </div>
       <span className="text-2xl font-extrabold tracking-tight">{partner.name} <span className="text-blue-300">×</span> Stream Monitor</span>
      </div>
      <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-5xl">Mais inteligência para seus servidores e aplicativos.</h1>
      <p className="max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
       Monitore DNS e servidores, receba alertas de instabilidade e acompanhe as informações disponibilizadas oficialmente pelos aplicativos integrados, tudo em um único painel.
      </p>
      <a href={registration} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-base font-bold text-white shadow-xl shadow-blue-600/15 transition hover:bg-blue-400">
       Criar minha conta <ArrowRight className="h-5 w-5"/>
      </a>
      <p className="text-xs text-slate-400">Cadastro gratuito. O convite é aplicado automaticamente ao criar sua conta.</p>
     </div>
     <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-[270px] lg:grid-cols-1">
      {[
       {icon:Server,title:"Seus servidores",desc:"Monitore DNS e instabilidades"},
       {icon:Smartphone,title:"Aplicativos",desc:"Acompanhe serviços integrados"},
       {icon:ShieldCheck,title:"Alertas seguros",desc:"Confirmação com evidências reais"},
      ].map(({icon:Icon,title,desc})=><div key={title} className="flex items-center gap-3 rounded-2xl border border-blue-300/15 bg-white/5 p-4">
       <Icon size={23} className="shrink-0 text-blue-300"/>
       <div><p className="text-sm font-bold">{title}</p><p className="text-xs leading-5 text-slate-300">{desc}</p></div>
      </div>)}
     </div>
    </div>
   </section>
   <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
    <section className="space-y-3 rounded-2xl border border-blue-400/20 bg-[#101d35] p-5 sm:p-7">
     <h2 className="text-xl font-extrabold">Como funciona?</h2>
     {[
      "Faça seu cadastro através desta página exclusiva da parceria.",
      "Adicione seus servidores para acompanhar disponibilidade e desempenho.",
      "Receba avisos de problemas confirmados e saiba quando eles foram resolvidos.",
     ].map((t,i)=><div key={t} className="flex items-start gap-3 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-sm font-bold text-blue-300">{i+1}</span>
      <p className="text-sm leading-7 text-slate-200">{t}</p>
     </div>)}
    </section>
    <section className="space-y-4 rounded-2xl border border-blue-400/20 bg-[#101d35] p-5">
     <h2 className="text-base font-bold">Compartilhe este convite</h2>
     <div ref={shareRef} className="space-y-3 rounded-xl bg-gradient-to-br from-[#173a79] to-[#0a1630] p-5 text-center">
      <div className="flex items-center justify-center gap-2 font-extrabold"><Activity className="text-blue-300"/>streammonitor</div>
      <p className="font-semibold">{partner.name} + Stream Monitor</p>
      <p className="text-xs text-blue-100">Monitoramento inteligente para sua revenda</p>
      <div className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={link} size={128}/></div>
      <p className="break-all text-[11px] text-blue-100">{link}</p>
     </div>
     <div className="grid grid-cols-2 gap-2">
      <button onClick={copy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-300/30 px-3 py-3 text-xs font-bold hover:bg-white/5"><Copy size={15}/> Copiar link</button>
      <button onClick={download} disabled={exporting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-xs font-bold hover:bg-blue-500 disabled:opacity-60"><Download size={15}/>{exporting?"Gerando…":"Baixar arte"}</button>
     </div>
    </section>
   </div>
   <footer className="flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-slate-400">
    <span>© Stream Monitor — tecnologia de monitoramento</span><a href="/privacidade" className="underline">Privacidade</a>
   </footer>
  </div>
 </main>;
}
