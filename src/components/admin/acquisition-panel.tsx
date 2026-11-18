import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getAdminAcquisitionReport} from "@/lib/acquisition-report.functions";
import {formatBRL} from "@/lib/payments";
import {Card,CardContent} from "@/components/ui/card";
import {
  Activity,CheckCircle2,Facebook,
  Info,Instagram,MousePointerClick,RefreshCw,ShieldCheck,
  Target,TrendingUp,Users,Wallet,
} from "lucide-react";

const labels:Record<string,string>={
 meta_ads:"Anúncios Meta",other_campaign:"Outras campanhas",referral:"Indicações",
 organic:"Busca orgânica",direct:"Acesso direto",
 social_unverified:"Rede social sem prova de anúncio",
 unattributed:"Sem atribuição / sem consentimento",facebook:"Facebook",
 instagram:"Instagram",other:"Outros",unknown:"Plataforma desconhecida",
 unidentified:"Campanha não identificada",
};
const number=(value:number)=>value.toLocaleString("pt-BR");
const money=(value:number|null|undefined)=>value==null?"Sem dados":formatBRL(value);
const pct=(numerator:number,denominator:number)=>{
 if(!Number.isFinite(numerator)||!Number.isFinite(denominator)||denominator<=0)return "—";
 return (numerator/denominator*100).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
};
const label=(key:string)=>labels[key]||key;
function Metric({
 title,value,detail,icon:Icon,tone="blue",
}:{
 title:string;value:string;detail?:string;
 icon:typeof Activity;tone?:"blue"|"violet"|"emerald"|"amber";
}){
 const colors={
  blue:"border-blue-500/25 bg-blue-500/5 text-blue-400",
  violet:"border-violet-500/25 bg-violet-500/5 text-violet-400",
  emerald:"border-emerald-500/25 bg-emerald-500/5 text-emerald-400",
  amber:"border-amber-500/25 bg-amber-500/5 text-amber-400",
 };
 return <Card className={"h-full rounded-2xl border "+colors[tone]}>
  <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
   <div className="flex items-start justify-between gap-2">
    <p className="text-xs font-medium leading-5 text-muted-foreground sm:text-sm">{title}</p>
    <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>
   </div>
   <p className="break-words text-[1.65rem] font-extrabold leading-tight tracking-tight text-foreground tabular-nums sm:text-[1.9rem]">{value}</p>
   {detail&&<p className="mt-auto text-[11px] leading-5 text-muted-foreground sm:text-xs">{detail}</p>}
  </CardContent>
 </Card>;
}
function Heading({eyebrow,title,description}:{
 eyebrow:string;title:string;description?:string;
}){
 return <div className="space-y-1">
  <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-blue-400">{eyebrow}</p>
  <h3 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h3>
  {description&&<p className="max-w-3xl text-xs leading-6 text-muted-foreground sm:text-sm">{description}</p>}
 </div>;
}
function FlowStep({step,labelText,value,hint,tone}:{
 step:number;labelText:string;value:number;hint:string;tone:"blue"|"violet"|"emerald";
}){
 const colors={
  blue:"border-blue-500/30 bg-blue-500/10 text-blue-400",
  violet:"border-violet-500/30 bg-violet-500/10 text-violet-400",
  emerald:"border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
 };
 return <div className="relative min-w-0 flex-1">
  <div className={"flex h-full flex-col gap-2 rounded-2xl border px-3 py-4 sm:p-4 "+colors[tone]}>
   <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">Etapa {step}</span>
   <strong className="text-3xl font-extrabold tracking-tight text-foreground tabular-nums">{number(value)}</strong>
   <span className="text-sm font-semibold text-foreground">{labelText}</span>
   <span className="text-[11px] leading-5 text-muted-foreground">{hint}</span>
  </div>
 </div>;
}
export function AcquisitionPanel(){
 const fn=useServerFn(getAdminAcquisitionReport);
 const {data,error,isLoading,refetch,isFetching}=useQuery({
  queryKey:["admin","client-acquisition-v1"],queryFn:()=>fn(),staleTime:60_000
 });
 if(isLoading)return <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Carregando os dados de aquisição…</Card>;
 if(error||!data)return <Card className="space-y-3 rounded-2xl p-6">
  <p className="text-sm text-destructive">Não foi possível consultar os dados de aquisição.</p>
  <button onClick={()=>void refetch()} className="rounded-lg border px-4 py-2 text-sm">Tentar novamente</button>
 </Card>;
 const {totals,bySource,byPlatform,byCampaign}=data;
 const meta=bySource.find(x=>x.key==="meta_ads");
 const social=byPlatform.filter(x=>x.key==="instagram"||x.key==="facebook");
 const socialSpend=social.reduce((sum,x)=>sum+(x.spendCents??0),0);
 const trackedConversion=pct(totals.paidWithFirstTouch,totals.newAttributed);
 const lastImport=data.metaCostsLastImported
  ?new Date(data.metaCostsLastImported).toLocaleString("pt-BR")
  :"ainda não informada";
 const firstCostDay=totals.costCoverageFirstDay?totals.costCoverageFirstDay.split("-").reverse().join("/"):"—";
 const lastCostDay=totals.costCoverageLastDay?totals.costCoverageLastDay.split("-").reverse().join("/"):"—";
 const hasUnlinkedCosts=totals.unlinkedSpendCents>0;
 return <div className="min-w-0 space-y-7 pb-6 sm:space-y-9">
  <header className="flex flex-col gap-4 rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-950/45 via-card to-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
   <div className="space-y-2">
    <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-300">
     <Activity size={14}/> Visão de aquisição
    </div>
    <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Aquisição de clientes</h2>
    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
     Entenda quantas pessoas chegaram, criaram uma conta e se tornaram clientes. Apenas dados observados, sem conversões inventadas.
    </p>
   </div>
   <button onClick={()=>void refetch()} disabled={isFetching}
    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-bold text-blue-200 transition hover:bg-blue-500/20 disabled:opacity-60">
    <RefreshCw size={16} className={isFetching?"animate-spin":""} aria-hidden="true"/>
    {isFetching?"Recarregando…":"Recarregar dados do painel"}
   </button>
  </header>

  <section className="space-y-3" aria-label="Resumo geral">
   <Heading eyebrow="01 · Resumo geral" title="Como está o Stream Monitor?"
    description="Total de contas e pagantes são dados da base inteira. Os números com origem são apenas daqueles com rastreamento registrado."/>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <Metric title="Contas na plataforma" value={number(totals.profiles)} detail="Todos os cadastros" icon={Users}/>
    <Metric title="Assinantes pagantes" value={number(totals.paidKnown)} detail="Já tiveram pagamento de assinatura" icon={CheckCircle2} tone="emerald"/>
    <Metric title="Cadastros com origem" value={number(totals.newAttributed)} detail="Origem identificada no cadastro" icon={Target} tone="violet"/>
    <Metric title="Pagantes com origem" value={number(totals.paidWithFirstTouch)} detail="Pagaram após cadastrar" icon={TrendingUp} tone="emerald"/>
   </div>
  </section>

  <section className="space-y-3" aria-label="Caminho do cliente">
   <Heading eyebrow="02 · Jornada de aquisição" title="Do anúncio até o pagamento"
    description="Cada etapa representa uma medição real. As fontes e períodos não são idênticos; a sequência é visual e não significa que todas as pessoas são as mesmas."/>
   <Card className="rounded-2xl border-border/70">
    <CardContent className="space-y-4 p-3 sm:p-5">
     <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <FlowStep step={1} value={totals.linkClicks} labelText="Cliques no anúncio" hint="Cliques importados da Meta" tone="blue"/>
      <FlowStep step={2} value={totals.landingPageViews} labelText="Visitaram a página" hint="Visualizações importadas da Meta" tone="blue"/>
      <FlowStep step={3} value={totals.signupPageVisits} labelText="Abriram cadastro" hint="Visitas medidas pelo site · até 90 dias" tone="violet"/>
      <FlowStep step={4} value={totals.newAttributed} labelText="Criaram uma conta" hint="Cadastro com origem rastreada" tone="violet"/>
      <FlowStep step={5} value={totals.paidWithFirstTouch} labelText="Concluíram pagamento" hint="Pagantes com origem registrada" tone="emerald"/>
     </div>
     <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
      <div className="flex items-start gap-2">
       <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400"/>
       <div>
        <p className="text-sm font-bold">De quem cadastrou com origem, quantos pagaram?</p>
        <p className="text-xs text-muted-foreground">Pagantes com origem ÷ cadastros com origem</p>
       </div>
      </div>
      <strong className="text-2xl font-extrabold tabular-nums text-emerald-400">{trackedConversion}</strong>
     </div>
     <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
      <Info size={15} className="mt-0.5 shrink-0"/>
      Os dados da Meta são importações pontuais; as visitas ao cadastro cobrem até 90 dias. Não calcule taxas entre cliques, visualizações e visitas porque os períodos e as fontes podem diferir.
     </p>
    </CardContent>
   </Card>
  </section>

  <section className="space-y-3" aria-label="Investimento e custos">
   <Heading eyebrow="03 · Investimento" title="Quanto está custando?"
    description="Valores da Meta copiados para o Stream Monitor. Apenas gastos de campanhas identificadas nos próprios cadastros entram no custo por cliente; campanhas antigas ficam separadas."/>
   <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <Metric title="Gasto importado · campanhas rastreadas" value={money(totals.spendCents)} detail={"Período do gasto: "+firstCostDay+" a "+lastCostDay+" · Última importação: "+lastImport} icon={Wallet} tone="amber"/>
    <Metric title="Custo por cadastro · Meta" value={money(meta?.costPerRegistrationCents)} detail="Gasto da mesma campanha ÷ cadastros com origem Meta" icon={MousePointerClick} tone="violet"/>
    <Metric title="Custo por pagante · Meta" value={money(meta?.costPerPaidCustomerCents)} detail="Gasto da mesma campanha ÷ pagantes atribuídos à Meta" icon={TrendingUp} tone="emerald"/>
   </div>
   <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs leading-6 text-muted-foreground">
    <p><strong className="text-foreground">O que significa “gasto importado”?</strong> É uma fotografia dos valores que a Meta informou na última consulta. Este botão só recarrega o banco do Stream Monitor; não força uma nova importação diretamente da Meta Ads.</p>
    {hasUnlinkedCosts&&<p className="mt-2 text-amber-300"><strong>Campanhas anteriores:</strong> {money(totals.unlinkedSpendCents)} de gastos importados não entram nos custos por cadastro desta campanha, pois pertencem a anúncios sem cadastros correspondentes.</p>}
   </div>
  </section>

  <section className="space-y-3" aria-label="Instagram versus Facebook">
   <Heading eyebrow="04 · Canais de anúncios" title="Instagram × Facebook"
    description="A participação é calculada somente com gastos importados de campanhas ligadas aos cadastros identificados; não representa uma regra de distribuição do orçamento da Meta."/>
   <div className="grid gap-3 md:grid-cols-2">
    {(["instagram","facebook"] as const).map(platform=>{
     const item=byPlatform.find(x=>x.key===platform);
     const spend=item?.spendCents??null;
     const share=spend!==null&&socialSpend>0?Math.min(100,Math.max(0,spend/socialSpend*100)):null;
     const IsIcon=platform==="instagram"?Instagram:Facebook;
     return <Card key={platform} className="overflow-hidden rounded-2xl border-border/70">
      <CardContent className="space-y-4 p-4 sm:p-5">
       <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className={"rounded-xl p-2 "+(platform==="instagram"?"bg-fuchsia-500/15 text-fuchsia-300":"bg-blue-500/15 text-blue-300")}><IsIcon size={20}/></span><h4 className="text-lg font-bold">{label(platform)}</h4></div>
        <span className="text-sm font-bold tabular-nums">{share===null?"—":pct(spend??0,socialSpend)}</span>
       </div>
       <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={"h-full rounded-full "+(platform==="instagram"?"bg-fuchsia-500":"bg-blue-500")}
         style={{width:(share??0)+"%"}}/>
       </div>
       <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-muted-foreground">Gasto da campanha rastreada</p><strong className="text-lg tabular-nums">{money(spend)}</strong></div>
        <div><p className="text-xs text-muted-foreground">Cadastros</p><strong className="text-lg tabular-nums">{number(item?.registrations??0)}</strong></div>
        <div><p className="text-xs text-muted-foreground">Pagantes identificados</p><strong className="text-lg tabular-nums">{number(item?.paidCustomers??0)}</strong></div>
        <div><p className="text-xs text-muted-foreground">Custo por cadastro</p><strong className="text-lg tabular-nums">{money(item?.costPerRegistrationCents)}</strong></div>
       </div>
      </CardContent>
     </Card>;
    })}
   </div>
  </section>

  <section className="space-y-3" aria-label="Origens e campanhas">
   <Heading eyebrow="05 · De onde vieram?" title="Origem dos cadastros"
    description="As origens são determinadas pelo rastreamento consentido; contas antigas sem origem não são classificadas como anúncios por suposição."/>
   <div className="grid gap-3 lg:grid-cols-2">
    {bySource.map(item=><Card key={item.key} className="rounded-2xl border-border/60">
     <CardContent className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
       <h4 className="min-w-0 break-words font-semibold">{label(item.key)}</h4>
       <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-xs font-bold">{number(item.registrations)} cadastros</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
       <SmallStat title="Pagantes" value={number(item.paidCustomers)}/>
       <SmallStat title="Visitas ao cadastro" value={item.signupPageVisits==null?"—":number(item.signupPageVisits)}/>
       <SmallStat title="Receita paga" value={money(item.revenueCents)}/>
       <SmallStat title="Gasto importado" value={money(item.spendCents)}/>
       <SmallStat title="Custo por cadastro" value={money(item.costPerRegistrationCents)}/>
       <SmallStat title="Custo por pagante" value={money(item.costPerPaidCustomerCents)}/>
      </div>
     </CardContent>
    </Card>)}
   </div>
   <div className="space-y-3 pt-2">
    <Heading eyebrow="Detalhamento" title="Campanhas rastreadas"
     description="Resultados disponíveis por campanha, sem misturar uma campanha com outra."/>
    <div className="space-y-2">
     {byCampaign.filter(x=>x.spendCents!==null||x.registrations>0).map(item=><div key={item.key} className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
       <p className="break-all text-sm font-semibold">{item.key}</p>
       {item.spendCents!==null&&item.registrations===0&&<p className="text-[11px] font-medium text-amber-400">Gasto histórico sem cadastros vinculados — fora do CAC atual</p>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:justify-end">
       <SmallStat title="Gasto" value={money(item.spendCents)}/>
       <SmallStat title="Cadastros" value={number(item.registrations)}/>
       <SmallStat title="Pagantes" value={number(item.paidCustomers)}/>
       <SmallStat title="Receita" value={money(item.revenueCents)}/>
      </div>
     </div>)}
     {!byCampaign.some(x=>x.spendCents!==null||x.registrations>0)&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">Ainda não há campanhas identificadas.</p>}
    </div>
   </div>
  </section>

  <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:p-5" aria-label="Transparência dos dados">
   <div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={18} className="text-amber-400"/> Informações importantes</div>
   <div className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground sm:text-sm">
    <p><strong className="text-foreground">Dados parciais:</strong> {number(totals.historicalUnattributed)} contas sem origem anterior comprovada. Quem recusa cookies de publicidade continua podendo se cadastrar.</p>
    <p><strong className="text-foreground">Pixel Meta:</strong> o recebimento dos eventos ainda não está certificado no Gerenciador de Eventos.</p>
    <p><strong className="text-foreground">Gastos:</strong> a última importação de campanhas rastreadas foi em {lastImport} e cobriu {firstCostDay} a {lastCostDay}. O botão “Recarregar” não consulta a Meta.</p>
    {hasUnlinkedCosts&&<p><strong className="text-foreground">Gastos de campanhas anteriores:</strong> {money(totals.unlinkedSpendCents)} preservados para auditoria, mas excluídos dos cálculos de custo da campanha rastreada.</p>}
    <p>{data.note}</p>
   </div>
  </section>
 </div>;
}
function SmallStat({title,value}:{title:string;value:string}){
 return <div className="min-w-0 space-y-0.5">
  <p className="text-[11px] text-muted-foreground">{title}</p>
  <p className="break-words text-sm font-bold tabular-nums">{value}</p>
 </div>;
}
