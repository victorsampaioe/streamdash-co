import {Link} from "@tanstack/react-router";
import {Activity,ArrowRight,Bell,CheckCircle2,Handshake,Server,Smartphone,Sparkles} from "lucide-react";

/**
 * Homepage announcement for the first official application partnership.
 * The logo is the original, unchanged image served by the RX Purple website.
 * Do not render a generated banner or imply every service is always online.
 */
const RX_PURPLE_OFFICIAL_LOGO="https://rxpurple.com/assets/logo_500x300.png";

const monitoredServices=[
 {name:"Painel de controle",icon:Activity},
 {name:"Aplicativo nas TVs",icon:Smartphone},
 {name:"Infraestrutura",icon:Server},
] as const;

export function RxPurplePartnership(){
 return (
  <section
   id="novidade-rx-purple"
   aria-labelledby="novidade-rx-purple-titulo"
   className="relative isolate overflow-hidden border-b border-violet-500/25 bg-[#070d1d] py-9 text-white sm:py-12"
  >
   <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_79%_10%,rgba(128,60,229,.23),transparent_55%),radial-gradient(ellipse_at_8%_100%,rgba(23,107,219,.19),transparent_53%)]"/>
   <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
    <div className="grid items-center gap-7 overflow-hidden rounded-[28px] border border-violet-400/25 bg-gradient-to-br from-[#13264a] via-[#0a1833] to-[#100d2a] p-5 shadow-[0_24px_70px_-35px_rgba(123,71,255,.35)] sm:p-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(310px,.85fr)] lg:gap-10 lg:p-10">
     <div className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center gap-2">
       <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-cyan-200">
        <Sparkles size={14}/> Nova parceria
       </span>
       <span className="inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1.5 text-[11px] font-bold text-violet-200">
        <Handshake size={14}/> Primeira parceria oficial
       </span>
      </div>
      <h2 id="novidade-rx-purple-titulo" className="max-w-2xl text-[clamp(1.9rem,4.7vw,3.3rem)] font-black leading-[1.12] tracking-tight">
       <span className="text-white">RX Purple</span> agora no <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">Stream Monitor</span>
      </h2>
      <p className="mt-4 max-w-xl text-sm leading-7 text-slate-200 sm:text-base">
       Chegou o monitoramento integrado de aplicativos! Além de acompanhar seus servidores e DNS, você pode consultar as informações oficiais dos serviços do <strong className="font-bold text-white">RX Purple</strong> e investigar com mais precisão a origem de uma instabilidade.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
       {monitoredServices.map(({name,icon:Icon})=>(
        <div key={name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.045] px-3 py-3 text-xs font-semibold text-blue-100">
         <Icon size={17} className="shrink-0 text-cyan-300" aria-hidden="true"/>{name}
        </div>
       ))}
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
       <Link to="/aplicativos" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400">
        Ver status dos aplicativos <ArrowRight size={17}/>
       </Link>
       <Link to="/auth" search={{tab:"signup"}} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-300/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
        Conhecer o Stream Monitor
       </Link>
      </div>
      <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-violet-200">
       <Sparkles size={16} className="shrink-0"/> Em breve, mais aplicativos parceiros!
      </p>
     </div>

     <div className="relative flex min-h-[245px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-violet-300/20 bg-[#080c22]/70 px-5 py-6 text-center sm:min-h-[285px]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(149,56,245,.19),transparent_69%)]"/>
      <img
       src={RX_PURPLE_OFFICIAL_LOGO}
       alt="Logo oficial RX Purple"
       className="relative z-10 mx-auto h-auto max-h-[208px] w-full max-w-[360px] object-contain drop-shadow-[0_12px_30px_rgba(119,29,211,.35)]"
       width={500}
       height={300}
       loading="eager"
      />
      <div className="relative z-10 mt-1 inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-100">
       <CheckCircle2 size={14} className="text-cyan-300"/> Integração com API oficial
      </div>
      <p className="relative z-10 mt-3 flex items-center justify-center gap-1.5 text-[11px] text-slate-300">
       <Bell size={13}/> Alertas de queda e recuperação após confirmação
      </p>
     </div>
    </div>
    <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">
     Indicadores informados pela API do parceiro. Consulte o estado atual no painel de aplicativos; uma falha de API não prova indisponibilidade do aplicativo inteiro.
    </p>
   </div>
  </section>
 );
}
