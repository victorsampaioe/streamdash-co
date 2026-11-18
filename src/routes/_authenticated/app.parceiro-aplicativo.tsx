import {createFileRoute,Link} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {toast} from "sonner";
import {Activity,Banknote,Bell,CheckCircle2,Clock3,Copy,ExternalLink,Gift,RefreshCw,ShieldCheck,Smartphone,TrendingUp,Users,Wallet} from "lucide-react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {getAppPartnerDashboard,requestAppPartnerPayout} from "@/lib/app-partners.functions";

export const Route=createFileRoute("/_authenticated/app/parceiro-aplicativo")({
 component:AppPartnerPage,
 head:()=>({meta:[{title:"Portal de Parceiros · Stream Monitor"}]})
});
const money=(c:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c/100);
const when=(x:string)=>new Date(x).toLocaleString("pt-BR",{timeZone:"America/Fortaleza"});
const badge=(s:string)=>({online:"Online",degraded:"Instabilidade",offline:"Offline",unknown:"Não confirmado",unverified:"Aguardando validação"}[s]||"Aguardando validação");
function Metric({name,value,icon:Icon,description}:{name:string;value:string;icon:typeof Activity;description?:string}){
 return <Card className="rounded-2xl border-blue-500/15 bg-gradient-to-br from-card to-blue-950/10 p-4 sm:p-5">
  <div className="flex items-start justify-between gap-3"><p className="text-xs text-muted-foreground">{name}</p><Icon size={18} className="shrink-0 text-blue-400"/></div>
  <strong className="mt-3 block break-words text-2xl font-extrabold tabular-nums sm:text-3xl">{value}</strong>
  {description&&<p className="mt-2 text-[11px] leading-5 text-muted-foreground">{description}</p>}
 </Card>;
}
function AppPartnerPage(){
 const queryClient=useQueryClient();
 const getDashboard=useServerFn(getAppPartnerDashboard);
 const requestPayout=useServerFn(requestAppPartnerPayout);
 const {data,error,isLoading,refetch,isFetching}=useQuery({queryKey:["app-partner-dashboard"],queryFn:()=>getDashboard(),staleTime:30000});
 const [pixKey,setPixKey]=useState("");
 const [amount,setAmount]=useState("");
 const [requesting,setRequesting]=useState(false);
 if(isLoading)return <div className="p-6 text-sm text-muted-foreground">Carregando o portal de parceiros…</div>;
 if(error)return <Card className="p-6 text-sm text-destructive">Não foi possível consultar a parceria. <Button variant="outline" onClick={()=>void refetch()}>Tentar novamente</Button></Card>;
 const info=data as any;
 if(!info?.partner)return <Card className="space-y-3 rounded-2xl p-6">
  <h1 className="text-xl font-bold">Portal de Parceiros de Aplicativos</h1>
  <p className="text-sm text-muted-foreground">Sua conta ainda não foi vinculada a uma empresa parceira. Peça ao administrador que vincule o e-mail da sua conta ao aplicativo.</p>
  <Link to="/app" className="text-sm font-semibold text-blue-400">Voltar ao painel</Link>
 </Card>;
 const partner=info.partner;
 const m=info.metrics;
 const url="https://streammonitor.site/convite/"+partner.slug;
 const payout=async()=>{
  const cents=Math.round(Number(amount.replace(",","."))*100);
  if(!Number.isSafeInteger(cents)||cents<=0||cents>m.availableCents)return toast.error("Informe um valor dentro do saldo disponível.");
  if(pixKey.trim().length<3)return toast.error("Informe uma chave Pix válida.");
  setRequesting(true);
  try{
   await requestPayout({data:{partnerId:partner.id,amountCents:cents,pixKey:pixKey.trim()}});
   toast.success("Solicitação de saque registrada! Aguarde a aprovação.");
   setAmount("");setPixKey("");await queryClient.invalidateQueries({queryKey:["app-partner-dashboard"]});
  }catch{toast.error("Solicitação indisponível. Confirme o saldo e os dados.");}
  finally{setRequesting(false);}
 };
 const copy=async()=>{try{await navigator.clipboard.writeText(url);toast.success("Link de parceria copiado!");}catch{toast.error("Não foi possível copiar.");}};
 return <div className="mx-auto max-w-7xl space-y-7 pb-8">
  <header className="rounded-3xl border border-blue-400/20 bg-gradient-to-br from-[#102958] via-[#111f3e] to-[#0b1528] p-5 text-white sm:p-8">
   <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
     <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10">
      {partner.logo_url?<img src={partner.logo_url} alt="" className="h-full w-full object-contain"/>:<Smartphone size={28} className="text-purple-300"/>}
     </div>
     <div><p className="text-[11px] font-extrabold uppercase tracking-[.15em] text-blue-300">Área exclusiva · Donos de aplicativos</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{partner.name}</h1>
      <p className="mt-1 text-xs text-blue-100">Parceria oficial de indicação com o Stream Monitor</p>
     </div>
    </div>
    <Button variant="outline" className="gap-2 border-white/30 bg-white/10 text-white hover:bg-white/20" onClick={()=>void refetch()} disabled={isFetching}><RefreshCw size={15} className={isFetching?"animate-spin":""}/>Atualizar dados</Button>
   </div>
   <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold">
    <span className="rounded-full border border-purple-300/30 bg-purple-400/10 px-3 py-1.5">Sua comissão: {partner.commission_rate_bps/100}%</span>
    <span className="rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1.5">Aplicativo: {badge(partner.status)}</span>
    <span className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5">{partner.commission_on_renewals?"Primeira compra e renovações":"Primeira compra elegível"}</span>
   </div>
  </header>
  <section className="space-y-3">
   <h2 className="text-lg font-bold">Visão geral da parceria</h2>
   <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <Metric name="Pessoas indicadas" value={String(m.registered)} icon={Users} description="Cadastros pelo seu link"/>
    <Metric name="Pagamentos com comissão" value={String(m.conversions)} icon={CheckCircle2} description="Pagamentos de assinatura elegíveis"/>
    <Metric name="Vendas atribuídas" value={money(m.grossCents)} icon={TrendingUp} description="Receita antes das taxas de pagamento"/>
    <Metric name="Comissão gerada" value={money(m.earnedCents)} icon={Gift} description="Sua participação sobre pagamentos válidos"/>
    <Metric name="Saldo disponível" value={money(m.availableCents)} icon={Wallet} description="Disponível para solicitar saque"/>
    <Metric name="Saques em análise" value={money(m.reservedCents)} icon={Clock3} description="Solicitados ou aprovados, ainda não pagos"/>
    <Metric name="Total recebido" value={money(m.paidCents)} icon={Banknote} description="Transferências registradas como pagas"/>
    <Metric name="Novos cadastros (30 dias)" value={String(m.new30d)} icon={Activity} description={"Últimos 7 dias: "+m.new7d}/>
   </div>
  </section>
  <div className="grid gap-5 lg:grid-cols-2">
   <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
    <h2 className="text-lg font-bold">Seu link exclusivo</h2>
    <p className="text-sm text-muted-foreground">Todo cliente que se cadastrar por este link será vinculado à sua parceria. A comissão só é registrada após pagamento elegível aprovado.</p>
    <div className="min-w-0 break-all rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-sm font-semibold text-blue-400">{url}</div>
    <div className="flex flex-wrap gap-2">
     <Button onClick={copy} className="gap-2"><Copy size={16}/>Copiar link</Button>
     <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-accent"><ExternalLink size={16}/>Ver página</a>
    </div>
   </section>
   <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
    <div className="flex items-center gap-2"><Banknote className="text-blue-400"/><h2 className="text-lg font-bold">Solicitar saque via Pix</h2></div>
    <p className="text-xs text-muted-foreground">Saldo disponível: <strong>{money(m.availableCents)}</strong>. A transferência não é automática; o administrador confirma o pagamento e o comprovante.</p>
    <div className="space-y-3">
     <label className="block text-xs font-semibold">Valor do saque em reais<Input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="Ex.: 15,00" className="mt-1.5"/></label>
     <label className="block text-xs font-semibold">Chave Pix<Input value={pixKey} onChange={e=>setPixKey(e.target.value)} placeholder="Sua chave Pix" className="mt-1.5"/></label>
     <Button disabled={requesting||m.availableCents<=0||info.role!=="owner"} onClick={payout} className="w-full">{requesting?"Enviando…":"Solicitar pagamento"}</Button>
    </div>
   </section>
  </div>
  <section className="rounded-2xl border border-border/70 bg-card p-5">
   <div className="flex items-center gap-2"><ShieldCheck className="text-blue-400"/><h2 className="text-lg font-bold">Status do seu aplicativo</h2></div>
   <p className="mt-2 text-sm text-muted-foreground">Situação: <strong>{badge(partner.status)}</strong>. A integração monitora apenas componentes informados pela API. Sem formato validado, nenhum incidente será anunciado como confirmado.</p>
   {partner.last_check_at&&<p className="mt-2 text-xs text-muted-foreground">Última verificação: {when(partner.last_check_at)}</p>}
   <div className="mt-4 space-y-2">{info.checks.map((x:any,i:number)=><div key={i} className="flex flex-wrap justify-between gap-2 border-b border-border/50 py-2 text-xs">
    <span>{badge(x.status)} · {x.evidence}</span><span className="text-muted-foreground">{when(x.checked_at)} · {x.latency_ms??"—"} ms</span>
   </div>)}</div>
  </section>
  <section className="grid gap-4 lg:grid-cols-2">
   <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
    <h2 className="text-base font-bold">Comissões recentes</h2>
    {info.commissions.length===0?<p className="text-sm text-muted-foreground">Aguardando primeiras assinaturas pagas.</p>:info.commissions.map((x:any)=><div key={x.id} className="flex justify-between gap-3 border-b border-border/40 py-2 text-xs">
     <div><p>{when(x.at)}</p><p className="text-muted-foreground">Compra de {money(x.orderCents)}</p></div>
     <span className={x.reversed?"text-amber-400":"font-bold text-blue-400"}>{x.reversed?"Estornada":money(x.commissionCents)}</span>
    </div>)}
   </div>
   <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
    <h2 className="text-base font-bold">Histórico de solicitações</h2>
    {info.payouts.length===0?<p className="text-sm text-muted-foreground">Nenhum saque solicitado.</p>:info.payouts.map((x:any)=><div key={x.id} className="flex justify-between gap-3 border-b border-border/40 py-2 text-xs">
     <div><p>{when(x.requested_at)}</p><p className="text-muted-foreground">{x.status==="paid"?"Pago":x.status==="requested"?"Em análise":x.status==="approved"?"Aprovado":"Recusado"}</p></div>
     <strong>{money(x.amount_cents)}</strong>
    </div>)}
   </div>
  </section>
  {info.truncated&&<p className="text-xs text-amber-500">Há mais de 5.000 registros em uma categoria. Solicite ao administrativo um extrato completo antes de conferir os totais.</p>}
  <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"><Bell size={16} className="mt-1 shrink-0"/> Os alertas de aplicativos são globais e seguem as preferências de Telegram de cada revendedor, após validação técnica da API e autorização administrativa.</p>
 </div>;
}
