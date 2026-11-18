import {createFileRoute,redirect} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {isAdminMaster} from "@/lib/permissions";
import {getAdminAppPartners,createAppPartner,updateAppPartner,assignAppPartnerOwner,
 testAppPartnerApi,markPartnerPayoutPaid} from "@/lib/app-partners.functions";
import {Activity,CheckCircle2,Copy,ExternalLink,Plus,RefreshCw,ShieldCheck,Smartphone,Wallet} from "lucide-react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/admin_/aplicativos-parceiros")({
 beforeLoad:async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)throw redirect({to:"/auth"});
  if(isAdminMaster(user.email))return;
  const {data,error}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
  if(error||data!==true)throw redirect({to:"/app"});
 },
 head:()=>({meta:[{title:"Parceiros de Aplicativos | Stream Monitor"},{name:"robots",content:"noindex,nofollow"}]}),
 component:AdminApplicationPartners,
});
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value/100);
function AdminApplicationPartners(){
 const client=useQueryClient();
 const fn=useServerFn(getAdminAppPartners);
 const create=useServerFn(createAppPartner);
 const update=useServerFn(updateAppPartner);
 const owner=useServerFn(assignAppPartnerOwner);
 const test=useServerFn(testAppPartnerApi);
 const markPaid=useServerFn(markPartnerPayoutPaid);
 const {data,error,isLoading,isFetching,refetch}=useQuery({queryKey:["admin-app-partners"],queryFn:()=>fn(),staleTime:15000});
 const [slug,setSlug]=useState("");const [name,setName]=useState("");const [apiUrl,setApiUrl]=useState("");
 const [ownerEmail,setOwnerEmail]=useState<Record<string,string>>({});
 const [payoutProof,setPayoutProof]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState("");const [probe,setProbe]=useState<Record<string,any>>({});
 const refresh=async()=>{await client.invalidateQueries({queryKey:["admin-app-partners"]});};
 const perform=async(key:string,cb:()=>Promise<unknown>)=>{
  if(busy)return;setBusy(key);
  try{await cb();toast.success("Alteração salva.");await refresh();}
  catch(e){toast.error(e instanceof Error?e.message:"Não foi possível concluir.");}
  finally{setBusy("");}
 };
 const add=()=>perform("new",async()=>{
  if(!slug||!name)throw new Error("Informe nome e identificador.");
  await create({data:{slug:slug.toLowerCase().trim(),name:name.trim(),apiUrl:apiUrl.trim()||undefined}});
  setName("");setSlug("");setApiUrl("");
 });
 if(isLoading)return <p className="p-6 text-sm text-muted-foreground">Carregando central de parceiros…</p>;
 if(error||!data)return <Card className="space-y-3 p-5"><p>Não foi possível carregar o administrativo.</p><Button onClick={()=>void refetch()}>Tentar novamente</Button></Card>;
 const report=data as any;
 return <div className="mx-auto max-w-7xl space-y-7 pb-8">
  <header className="flex flex-col gap-4 rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-950/40 to-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
   <div className="space-y-1"><p className="text-xs font-extrabold uppercase tracking-wider text-blue-400">Administração · Stream Monitor</p>
    <h1 className="text-2xl font-extrabold sm:text-3xl">Parceiros de aplicativos</h1>
    <p className="text-sm text-muted-foreground">Marcas, APIs, comissão de 60%, indicações e pagamentos de parceiros.</p>
   </div>
   <Button variant="outline" onClick={()=>void refetch()} disabled={isFetching} className="gap-2"><RefreshCw size={16}/>Atualizar</Button>
  </header>
  <Card className="space-y-4 rounded-2xl p-5">
   <h2 className="flex items-center gap-2 text-lg font-bold"><Plus className="text-blue-400"/>Cadastrar outra parceria</h2>
   <div className="grid gap-3 sm:grid-cols-3">
    <label className="text-xs font-semibold">Nome do aplicativo<Input className="mt-1" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Meu Player"/></label>
    <label className="text-xs font-semibold">Identificador do link<Input className="mt-1" value={slug} onChange={e=>setSlug(e.target.value)} placeholder="meuplayer"/></label>
    <label className="text-xs font-semibold">API HTTPS (opcional)<Input className="mt-1" value={apiUrl} onChange={e=>setApiUrl(e.target.value)} placeholder="https://example.com/status"/></label>
   </div>
   <Button disabled={!!busy} onClick={add}>Cadastrar parceiro</Button>
   <p className="text-xs text-muted-foreground">Nova parceria começa com monitoramento e avisos globais desativados até validação técnica.</p>
  </Card>
  {(report.partners as any[]).map(partner=>{
   const refs=(report.referrals as any[]).filter(x=>x.partner_id===partner.id);
   const commission=(report.commissions as any[]).filter(x=>x.partner_id===partner.id&&!x.reversed_at)
    .reduce((sum:number,x:any)=>sum+Number(x.amount_cents),0);
   const payouts=(report.payouts as any[]).filter(x=>x.partner_id===partner.id);
   const paid=payouts.filter(x=>x.status==="paid").reduce((sum:number,x:any)=>sum+Number(x.amount_cents),0);
   const reserved=payouts.filter(x=>["requested","approved"].includes(x.status)).reduce((sum:number,x:any)=>sum+Number(x.amount_cents),0);
   const memberCount=(report.members as any[]).filter(x=>x.partner_id===partner.id).length;
   const invite="https://streammonitor.site/convite/"+partner.slug;
   const currentProbe=probe[partner.id];
   const change=(input:any)=>perform("save-"+partner.id,()=>update({data:{partnerId:partner.id,...input}}));
   return <section key={partner.id} className="space-y-4 rounded-3xl border border-blue-500/20 bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400"><Smartphone size={24}/></span>
      <div><h2 className="text-xl font-bold">{partner.name}</h2><p className="text-xs text-muted-foreground">/{partner.slug} · {memberCount} usuário(s) vinculado(s)</p></div>
     </div>
     <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">{partner.partnership_status==="active"?"Parceria ativa":"Parceria pausada"}</span>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
     {[
      ["Cadastros indicados",String(refs.length)],
      ["Comissões geradas",money(commission)],
      ["Saldo disponível",money(Math.max(0,commission-paid-reserved))],
      ["Total pago ao parceiro",money(paid)]
     ].map(([a,b])=><div key={a} className="rounded-xl border border-border/70 bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{a}</p><p className="mt-2 break-all text-xl font-extrabold">{b}</p>
     </div>)}
    </div>
    <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
     <p className="text-sm font-bold">Link exclusivo do parceiro</p>
     <div className="break-all text-xs text-blue-400">{invite}</div>
     <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" className="gap-2" onClick={async()=>{
       try{await navigator.clipboard.writeText(invite);toast.success("Link copiado");}catch{toast.error("Não foi possível copiar");}
      }}><Copy size={14}/>Copiar</Button>
      <a href={invite} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"><ExternalLink size={14}/>Abrir página</a>
     </div>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
     <div className="space-y-3 rounded-2xl border border-border/70 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-blue-400"/>API e monitoramento</h3>
      <p className="break-all text-xs text-muted-foreground">Endpoint: {partner.api_url||"Não informado"}</p>
      <p className="text-xs text-muted-foreground">Último estado: <strong>{partner.status}</strong> · Última leitura: {partner.last_check_at?new Date(partner.last_check_at).toLocaleString("pt-BR"):"nunca"}</p>
      {(report.services as any[]).filter(x=>x.partner_id===partner.id).map(service=><div key={service.service_id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
       <span>{service.name}</span><strong className={service.status==="online"?"text-emerald-400":service.status==="degraded"?"text-amber-400":"text-red-400"}>{service.status}{service.uptime_30d!=null?" · "+service.uptime_30d+"%":""}</strong>
      </div>)}
      <button disabled={!!busy} onClick={async()=>{
       setBusy("probe-"+partner.id);
       try{const result=await test({data:{partnerId:partner.id}});setProbe(p=>({...p,[partner.id]:result}));}
       catch{toast.error("Não foi possível testar a API agora.");}
       finally{setBusy("");}
      }} className="w-full rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-400">
       {busy==="probe-"+partner.id?"Verificando…":"Testar API (sem enviar alertas)"}
      </button>
      {currentProbe&&<div className="space-y-1 rounded-lg border border-border/70 bg-background/50 p-3 text-xs leading-6">
       <p>Teste: <strong>{currentProbe.status}</strong> · HTTP {currentProbe.httpStatus??"—"} · {currentProbe.latencyMs} ms. {currentProbe.evidence}</p>
       {currentProbe.components?.map((svc:any)=><p key={svc.id}>• {svc.name}: {svc.status}{svc.uptime30d!=null?" · "+svc.uptime30d+"% (30d)":""}</p>)}
       {currentProbe.stability30d!=null&&<p>Estabilidade declarada pelo fornecedor: {currentProbe.stability30d}% · Incidentes: {currentProbe.incidents30d??"—"}</p>}
      </div>}
      <label className="block space-y-1 text-xs font-semibold">Formato validado da API
       <select value={partner.api_kind} disabled={!!busy} onChange={e=>void change({apiKind:e.target.value,monitorEnabled:false,broadcastEnabled:false})}
        className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm">
        <option value="unverified">Ainda não verificado</option>
        <option value="statuspage_v2">Statuspage JSON (status.indicator)</option>
        <option value="simple_status">JSON simples (status: online/offline)</option>
        <option value="rx_purple">RX Purple — API de serviços oficial</option>
       </select>
      </label>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 text-xs font-medium">
       <span>Monitoramento periódico ativo</span><input type="checkbox" checked={partner.monitor_enabled} disabled={!!busy||partner.api_kind==="unverified"} onChange={e=>void change({monitorEnabled:e.target.checked,...(!e.target.checked?{broadcastEnabled:false}:{})})}/>
      </label>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 p-3 text-xs font-medium">
       <span>Avisos globais de queda e retorno pelo Telegram</span><input type="checkbox" checked={partner.broadcast_enabled} disabled={!!busy||!partner.monitor_enabled||partner.api_kind==="unverified"} onChange={e=>void change({broadcastEnabled:e.target.checked})}/>
      </label>
      <p className="text-[11px] leading-5 text-amber-500">Só ative os avisos após confirmar o formato e a confiabilidade da API. Falha HTTP isolada não é uma queda comprovada.</p>
     </div>
     <div className="space-y-4 rounded-2xl border border-border/70 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Wallet size={17} className="text-blue-400"/>Conta, comissões e pagamentos</h3>
      <label className="block text-xs font-semibold">Vincular dono do aplicativo pelo e-mail da conta existente
       <div className="mt-1.5 flex flex-wrap gap-2">
        <Input value={ownerEmail[partner.id]??""} onChange={e=>setOwnerEmail(v=>({...v,[partner.id]:e.target.value}))} placeholder="email@aplicativo.com" className="min-w-[170px] flex-1"/>
        <Button variant="outline" disabled={!!busy} onClick={()=>perform("owner-"+partner.id,()=>owner({data:{partnerId:partner.id,email:ownerEmail[partner.id]??""}}))}>Vincular</Button>
       </div>
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
       <div><p className="text-xs font-semibold">Comissão do parceiro</p><p className="text-xs text-muted-foreground">Somente primeira venda por padrão</p></div>
       <strong className="text-lg text-blue-400">{partner.commission_rate_bps/100}%</strong>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 text-xs">
       <span>Pagar também pelas renovações (opcional)</span>
       <input type="checkbox" checked={partner.commission_on_renewals} disabled={!!busy} onChange={e=>void change({renewals:e.target.checked})}/>
      </label>
      <p className="text-xs text-muted-foreground">Comissão padrão: 60% para o parceiro e 40% para Stream Monitor, calculadas a cada pagamento elegível aprovado.</p>
     </div>
    </div>
    {payouts.length>0&&<div className="space-y-3 rounded-xl border border-border/70 p-4">
     <h3 className="text-sm font-bold">Saques dos parceiros</h3>
     {payouts.map((p:any)=><div key={p.id} className="flex flex-col justify-between gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
      <div className="text-xs"><p className="font-bold">{money(p.amount_cents)} · {p.status}</p><p className="mt-1 text-muted-foreground">Chave Pix: {p.pix_key}</p></div>
      {["requested","approved"].includes(p.status)&&<div className="flex flex-wrap gap-2">
       <Input className="w-48" value={payoutProof[p.id]??""} onChange={e=>setPayoutProof(v=>({...v,[p.id]:e.target.value}))} placeholder="ID do comprovante"/>
       <Button size="sm" disabled={!!busy||!(payoutProof[p.id]||"").trim()} onClick={()=>perform("pay-"+p.id,()=>markPaid({data:{payoutId:p.id,reference:payoutProof[p.id]}}))}>Registrar Pix pago</Button>
      </div>}
     </div>)}
    </div>}
   </section>;
  })}
 </div>;
}
