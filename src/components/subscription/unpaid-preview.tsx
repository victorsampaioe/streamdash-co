import {Link,useRouterState} from "@tanstack/react-router";
import {Activity,ArrowRight,Bell,BookOpen,CheckCircle2,CreditCard,Eye,Film,Globe,Lock,ServerIcon,ShieldCheck,Sparkles,Trophy,Video,Wifi} from "lucide-react";
import {ResellerCreditRules} from "./reseller-credit-rules";

const features=[
 {href:"/app",title:"Visão geral",group:"Painel de controle",description:"Acompanhe o estado da sua operação num só lugar.",icon:Activity},
 {href:"/app/servers",title:"Monitoramento de servidores",group:"Monitoramento",description:"Verifique DNS, HTTP, SSL, latência e disponibilidade.",icon:ServerIcon},
 {href:"/app/alerts",title:"Alertas no Telegram",group:"Alertas",description:"Receba avisos de falha e recuperação após confirmação.",icon:Bell},
 {href:"/app/diagnostico",title:"Diagnósticos",group:"Diagnóstico",description:"Analise as causas prováveis de instabilidades.",icon:ShieldCheck},
 {href:"/app/central",title:"Central Inteligente",group:"Inteligência",description:"Encontre orientações para agir rapidamente.",icon:Sparkles},
 {href:"/app/falhas",title:"Radar de falhas",group:"Monitoramento",description:"Conheça a distribuição dos incidentes e o histórico.",icon:Globe},
 {href:"/app/radar",title:"Radar Brasil",group:"Conteúdo",description:"Explore os recursos de acompanhamento de conteúdo.",icon:Wifi},
 {href:"/app/inteligencia",title:"Inteligência de conteúdo",group:"Conteúdo",description:"Descubra ferramentas para acompanhar catálogos.",icon:Film},
 {href:"/vitrine-futebol",title:"Vitrine IA Futebol",group:"Divulgação",description:"Crie artes dos jogos do dia e dos resultados finais.",icon:Trophy},
 {href:"/vitrine-ai",title:"Vitrine IA",group:"Divulgação",description:"Crie artes para filmes e séries com sua identidade.",icon:Sparkles},
 {href:"/vitrine-banner",title:"Vitrine Banner",group:"Divulgação",description:"Monte banners de filmes e séries com logo e contato.",icon:Film},
 {href:"/vitrine-video-modelos",title:"Vitrine Vídeos",group:"Divulgação",description:"Personalize vídeos MP4 com narração, logo e WhatsApp.",icon:Video},
 {href:"/app/ajuda",title:"Central de Ajuda",group:"Suporte",description:"Conheça o suporte e orientações para sua operação.",icon:BookOpen},
] as const;
export function UnpaidPreview(){
 const pathname=useRouterState({select:s=>s.location.pathname});
 const active=features.find(item=>pathname===item.href||pathname.startsWith(item.href+"/")) || features[0];
 const SelectedIcon=active.icon;
 const showAll=pathname==="/app";
 return <div className="mx-auto max-w-6xl space-y-6 pb-12 text-foreground" data-testid="unpaid-readonly-preview">
  <div className="rounded-2xl border border-blue-400/35 bg-gradient-to-r from-blue-600/15 via-slate-900/80 to-slate-950 p-5 shadow-xl sm:p-8">
   <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-300"><Eye className="h-4 w-4"/> MODO DEMONSTRAÇÃO · SOMENTE VISUALIZAÇÃO</div>
   <div className="mt-5 flex flex-wrap items-start gap-4">
    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><SelectedIcon size={24}/></span>
    <div className="min-w-0 flex-1">
     <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{showAll?"Conheça seu futuro painel Stream Monitor":active.title}</h1>
     <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{showAll?"Explore as telas e veja as vantagens do sistema antes de ativar sua conta.":active.description+" Esta é uma prévia demonstrativa, não representa informações de um servidor real."}</p>
    </div>
   </div>
   <div className="mt-5 flex flex-wrap items-center gap-3">
    <Link to="/app/subscription" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-400"><CreditCard size={17}/> Escolher plano e pagar por Pix <ArrowRight size={17}/></Link>
    <Link to="/app" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-400/30 px-5 py-3 text-sm font-semibold text-blue-200 transition hover:bg-blue-500/10">Ver recursos disponíveis</Link>
   </div>
   <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Lock size={14}/> Adicionar servidores, consultar dados privados, alterar configurações, gerar e baixar conteúdos só após a ativação.</p>
  </div>
  <div className="grid gap-3 md:grid-cols-2">
    <Link to="/app/subscription" className="rounded-2xl border border-blue-500/45 bg-blue-500/10 p-5 transition hover:bg-blue-500/15">
      <div className="text-xs font-bold uppercase tracking-wider text-blue-300">Quero monitorar</div>
      <h2 className="mt-2 text-xl font-black">R$ 25 por mês</h2>
      <p className="mt-2 text-sm text-muted-foreground">DNS, HTTP, SSL, alertas no Telegram e diagnósticos inteligentes. Ativação pelo Pix.</p>
      <div className="mt-3 flex items-center gap-1 text-sm font-bold text-blue-300">Assinar plano mensal <ArrowRight size={16}/></div>
    </Link>
    <Link to="/app/subscription" className="rounded-2xl border border-indigo-500/45 bg-indigo-500/10 p-5 transition hover:bg-indigo-500/15">
      <div className="text-xs font-bold uppercase tracking-wider text-indigo-300">Quero revender</div>
      <h2 className="mt-2 text-xl font-black">10 créditos por R$ 60</h2>
      <p className="mt-2 text-sm text-muted-foreground">Crie clientes, defina seus preços e mantenha a revenda operacional enquanto houver créditos.</p>
      <div className="mt-3 flex items-center gap-1 text-sm font-bold text-indigo-300">Ver pacote de créditos <ArrowRight size={16}/></div>
    </Link>
  </div>
  <ResellerCreditRules compact/>
  <div className="grid gap-4 md:grid-cols-3">
   {[
    {icon:Globe,label:"DNS + HTTP + SSL",value:"Verificações de disponibilidade",desc:"Acompanhe a saúde de cada servidor com dados da sua própria conta."},
    {icon:Bell,label:"Telegram",value:"Alertas de falha e recuperação",desc:"Saiba quando uma instabilidade for confirmada."},
    {icon:Sparkles,label:"Vitrines IA",value:"Artes e vídeos personalizados",desc:"Divulgue seu serviço com a marca e o WhatsApp da sua revenda."}
   ].map(item=><div key={item.label} className="rounded-2xl border border-blue-400/20 bg-card/70 p-5">
    <item.icon size={21} className="text-blue-400"/><p className="mt-3 text-xs font-bold uppercase tracking-widest text-blue-400">{item.label}</p><p className="mt-1 font-bold">{item.value}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.desc}</p>
   </div>)}
  </div>
  <section className="space-y-4">
   <div className="flex items-center justify-between gap-3">
    <h2 className="text-xl font-black">Explore as ferramentas</h2>
    <span className="text-xs text-muted-foreground">Prévia sem acesso operacional</span>
   </div>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {features.map(item=><Link to={item.href} key={item.href} className={"group rounded-2xl border p-4 transition-colors hover:border-blue-400/60 hover:bg-blue-500/[.07] "+(pathname===item.href?"border-blue-500/55 bg-blue-500/10":"border-border/70 bg-card/45")}>
     <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400"><item.icon size={20}/></span>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide text-blue-400">{item.group}</div><h3 className="mt-0.5 font-bold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p></div><Lock className="h-4 w-4 text-muted-foreground"/>
     </div></Link>)}
   </div>
  </section>
  <section className="rounded-2xl border border-blue-400/20 bg-card/50 p-4 sm:p-6">
   <h2 className="text-lg font-black">Exemplos do que você pode criar após assinar</h2>
   <p className="mt-1 text-xs text-muted-foreground">Imagens demonstrativas, não são resultados esportivos ao vivo.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-3">
    {[
      {src:"/examples/futebol-20261117-01-eventos.jpg",title:"Eventos de hoje"},
      {src:"/examples/futebol-20261117-02-jogos.jpg",title:"Jogos do dia"},
      {src:"/examples/futebol-20261117-03-final.jpg",title:"Fim de jogo"},
    ].map(item=><div key={item.title} className="overflow-hidden rounded-xl border border-border/70 bg-background/60">
      <img src={item.src} alt={"Exemplo de "+item.title} loading="lazy" width={450} height={570} className="aspect-[4/5] w-full object-contain"/>
      <div className="flex items-center justify-between p-3 text-sm font-semibold"><span>{item.title}</span><Lock size={14} className="text-muted-foreground"/></div>
    </div>)}
   </div>
  </section>
  <div className="rounded-2xl border border-blue-400/30 bg-blue-500/10 p-5 text-center sm:p-7">
   <CheckCircle2 className="mx-auto h-7 w-7 text-blue-400"/>
   <h2 className="mt-2 text-xl font-black">Pronto para liberar todas as funções?</h2>
   <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">Escolha seu plano, conclua o pagamento no painel e comece a usar os recursos na sua própria conta.</p>
   <Link to="/app/subscription" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500">Ativar minha conta <ArrowRight size={17}/></Link>
  </div>
 </div>;
}
