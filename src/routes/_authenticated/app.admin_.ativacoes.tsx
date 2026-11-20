import {createFileRoute,redirect} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {isAdminMaster} from "@/lib/permissions";
import {Button} from "@/components/ui/button";
import {Card} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {toast} from "sonner";
import {ArrowLeft,Check,ImageIcon,Search,RefreshCcw,ShieldCheck,Smartphone,Wallet,AlertTriangle,Save,ExternalLink} from "lucide-react";
import {Link} from "@tanstack/react-router";

export const Route=createFileRoute("/_authenticated/app/admin_/ativacoes")({
  beforeLoad:async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw redirect({to:"/auth"});
    if(isAdminMaster(user.email))return;
    const {data,error}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
    if(error||data!==true)throw redirect({to:"/app"});
  },
  head:()=>({meta:[
    {title:"Admin | Preços de Ativação — Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"},
  ]}),
  component:AppActivationAdmin,
});

const API="https://streammonitor-app-activations.victorsampaio133.workers.dev";
type App={id:string;name:string;module:string|null;providerValue:number|null;storePriceCents:number|null;priceCents:number|null;logoUrl:string|null;active:number;updatedAt:number};
type Catalog={items:App[];logoCount:number;supplierFields:string[];note:string;sync?:Record<string,string>};
type FlowCheck={
  steps:Record<string,string>;
  catalog:{total:number;published:number;logos:number};
  financial:{databaseConnected:boolean;providerConnected:boolean;webhookRegistered:boolean;accountAuthorized:boolean;environmentMatched:boolean;orderCount:number|null;eventCount:number|null;lastProbeAt:number|null;paymentEnabled:boolean};
  supplierLiveEnabled:boolean;pricesApproved:boolean;dryRunOnly:boolean;
};
type Edit={price?:string;logo?:string};
async function cf<T>(path:string,method:"GET"|"POST"="GET",body?:unknown):Promise<T>{
  const {data:{session},error}=await supabase.auth.getSession();
  if(error||!session?.access_token)throw new Error("Faça login novamente para acessar esta página.");
  const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if(!key)throw new Error("Acesso ao serviço de autenticação indisponível.");
  const response=await fetch(API+path,{
    method,
    headers:{"Authorization":"Bearer "+session.access_token,"x-sm-public-key":key,
      ...(body!==undefined?{"Content-Type":"application/json"}:{})},
    body:body!==undefined?JSON.stringify(body):undefined,
    cache:"no-store",
  });
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(json?.error||"Não foi possível acessar a Cloudflare.");
  return json as T;
}
function toMoney(cents:number|null){return cents===null?"Não definido":
  (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function rawCost(cents:number|null){return cents===null?"Não informado":
  (cents/100).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:3});}
function AdminRow({app,save,isSaving}:{app:App;save:(app:App,edit:Edit)=>Promise<void>;isSaving:boolean}){
  const [edit,setEdit]=useState<Edit>({});
  const [showLogo,setShowLogo]=useState(false);
  const price=edit.price??((app.priceCents??app.storePriceCents)===null?"":((app.priceCents??app.storePriceCents)!/100).toFixed(2));
  const logo=edit.logo??(app.logoUrl||"");
  const changed=Object.prototype.hasOwnProperty.call(edit,"price")||Object.prototype.hasOwnProperty.call(edit,"logo");
  async function submit(){
    await save(app,edit);
    setEdit({});
  }
  return <div className="group grid gap-3 border-b border-border/50 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(200px,1fr)_145px_190px_150px] lg:items-center">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-400/20 bg-gradient-to-br from-[#111d34] to-[#1c315c] text-lg font-bold text-blue-200">
        {app.logoUrl?<img src={app.logoUrl} alt="" loading="lazy" className="h-full w-full object-contain"/>:<Smartphone className="h-6 w-6"/>}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-extrabold" title={app.name}>{app.name}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{app.module||"Aplicativo de mídia"}</p>
        <button type="button" onClick={()=>setShowLogo(v=>!v)}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:underline">
          <ImageIcon size={12}/>{app.logoUrl?"Trocar foto":"Adicionar foto"}
        </button>
        {showLogo&&<div className="mt-2 flex max-w-xs flex-col gap-1">
          <Input aria-label={"Foto de "+app.name} className="h-9 text-xs" placeholder="https://.../logo.png"
            value={logo} onChange={e=>setEdit(s=>({...s,logo:e.target.value}))}/>
          <p className="text-[10px] text-muted-foreground">URL HTTPS da imagem; deixe vazio para remover.</p>
        </div>}
      </div>
    </div>
    <div className="lg:pl-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground lg:hidden">Valor informado pela API</p>
      <span className="text-sm font-medium tabular-nums">{rawCost(app.providerValue)}</span>
      <p className="text-[10px] text-muted-foreground">Valor bruto da API</p>
      {app.storePriceCents!==null&&<p className="mt-1 text-[11px] font-semibold text-blue-400" title="Preço informado no campo valor_da_loja do fornecedor">Loja: {toMoney(app.storePriceCents)}</p>}
      <p className="mt-1 text-[10px] text-emerald-400">Preço ativo: {toMoney(app.storePriceCents)}</p>
    </div>
    <div>
      <label htmlFor={"price-"+app.id} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted-foreground lg:hidden">Valor manual arquivado (R$)</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">R$</span>
        <Input id={"price-"+app.id} type="text" inputMode="decimal"
          placeholder="Ex.: 19,90" className="h-10 rounded-xl pl-10 font-semibold tabular-nums"
          value={price} onChange={e=>setEdit(s=>({...s,price:e.target.value}))}/>
      </div>
    </div>
    <div className="flex items-center gap-2 lg:justify-end">
      <Button type="button" disabled={!changed||isSaving} onClick={()=>void submit()}
        className="h-10 flex-1 gap-1.5 rounded-xl lg:flex-none"><Save size={15}/>{isSaving?"Salvando...":"Salvar preço"}</Button>
      {app.priceCents!==null&&<Check size={16} className="shrink-0 text-emerald-500"/>}
    </div>
  </div>;
}
function AppActivationAdmin(){
  const query=useQuery({queryKey:["admin-ativeapp-prices"],queryFn:()=>cf<Catalog>("/v1/admin/catalog"),retry:1,staleTime:30000});
  const readiness=useQuery({
    queryKey:["admin-activations-flow-check"],
    queryFn:()=>cf<FlowCheck>("/v1/admin/flow-check"),
    staleTime:30000,retry:1,
  });
  const qc=useQueryClient();
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<"all"|"missing"|"withLogo">("all");
  const [busy,setBusy]=useState("");
  const [syncing,setSyncing]=useState(false);
  const apps=query.data?.items||[];
  const priced=apps.filter(a=>a.priceCents!==null).length;
  const filtered=apps.filter(a=>{
    if(filter==="missing"&&a.priceCents!==null)return false;
    if(filter==="withLogo"&&!a.logoUrl)return false;
    return a.name.toLowerCase().includes(search.toLowerCase().trim());
  });
  async function syncCatalog(){
    if(syncing)return;
    setSyncing(true);
    try{
      const result=await cf<{refreshed:boolean;imported?:number;pages?:number;error?:string;failedPage?:number}>(
        "/v1/admin/refresh-catalog","POST",{});
      if(!result.refreshed)throw new Error("O fornecedor não completou a atualização.");
      toast.success("Importação concluída: "+result.imported+" aplicativos em "+result.pages+" páginas.");
      await Promise.all([
        qc.invalidateQueries({queryKey:["admin-ativeapp-prices"]}),
        qc.invalidateQueries({queryKey:["ativeapp-catalog"]}),
      ]);
    }catch(e){toast.error(e instanceof Error?e.message:"Erro ao consultar fornecedor.");}
    finally{setSyncing(false);}
  }
  async function save(app:App,edit:Edit){
    if(busy)return;
    setBusy(app.id);
    try{
      const priceStr=edit.price===undefined?(app.priceCents===null?"":(app.priceCents/100).toFixed(2)):edit.price.trim();
      const numeric=priceStr?Number(priceStr.replace(",", ".")):null;
      if(numeric!==null&&(!Number.isFinite(numeric)||numeric<1||numeric>9999.99))
        throw new Error("Informe um preço válido entre R$ 1,00 e R$ 9.999,99.");
      const priceCents=numeric===null?null:Math.round(numeric*100);
      const params:Record<string,unknown>={appId:app.id,priceCents};
      if(Object.prototype.hasOwnProperty.call(edit,"logo"))params.logoUrl=edit.logo||null;
      await cf("/v1/admin/price","POST",params);
      toast.success("Preço de "+app.name+" salvo na Cloudflare.");
      await Promise.all([
        qc.invalidateQueries({queryKey:["admin-ativeapp-prices"]}),
        qc.invalidateQueries({queryKey:["ativeapp-catalog"]}),
      ]);
    }catch(e){toast.error(e instanceof Error?e.message:"Não foi possível salvar o preço.");}
    finally{setBusy("");}
  }
  return <div className="mx-auto max-w-7xl space-y-6 pb-12">
    <div className="relative overflow-hidden rounded-[26px] border border-blue-400/20 bg-gradient-to-br from-[#08142b] via-[#122749] to-[#172650] p-6 text-white shadow-xl sm:p-9">
      <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl"/>
      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-widest text-blue-200">
            <ShieldCheck size={14}/> Administração • Cloudflare D1
          </span>
          <Link to="/app/ativacao-aplicativos" className="inline-flex items-center gap-1.5 text-xs text-blue-200 hover:underline">
            Ver página do cliente <ExternalLink size={14}/>
          </Link>
        </div>
        <h1 className="text-2xl font-black tracking-tight sm:text-4xl">Preços de ativação</h1>
        <p className="mt-3 max-w-2xl text-sm text-blue-100/70">
          Preços e fotos da API são importados pela Cloudflare. Os valores da loja são usados nas ativações; seus preços manuais antigos continuam registrados apenas como referência.
        </p>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[
        {label:"Aplicativos recebidos",value:String(apps.length),icon:Smartphone},
        {label:"Preços manuais salvos",value:String(priced)+" / "+String(apps.length),icon:Wallet},
        {label:"Imagens disponíveis",value:String(query.data?.logoCount??0),icon:ImageIcon},
      ].map(metric=><Card key={metric.label} className="flex items-center gap-3 rounded-2xl border-border/60 p-4">
        <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400"><metric.icon className="h-5 w-5"/></div>
        <div><p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-xl font-black tabular-nums">{metric.value}</p></div>
      </Card>)}
    </div>
    <Card className="space-y-4 rounded-2xl border-border/70 p-5" id="audit-activation-flow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-extrabold">Diagnóstico do fluxo de ativação</h2>
          <p className="mt-1 text-xs text-muted-foreground">Leitura da Cloudflare, sem criar Pix ou ativação</p></div>
        <Button type="button" size="sm" variant="outline" className="gap-2 rounded-xl"
          disabled={readiness.isFetching} onClick={()=>void readiness.refetch()}>
          <RefreshCcw size={14} className={readiness.isFetching?"animate-spin":""}/>Verificar agora
        </Button>
      </div>
      {readiness.isLoading?<p className="text-xs text-muted-foreground">Consultando etapas...</p>:
        readiness.isError?<p role="alert" className="text-xs text-destructive">Não foi possível conferir o fluxo. Atualize a sessão e tente novamente.</p>:
        readiness.data&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Catálogo precificado",readiness.data.catalog.published>0,
              readiness.data.catalog.published+" de "+readiness.data.catalog.total+" aplicativos"],
            ["Fotos recebidas",readiness.data.catalog.logos>0,
              String(readiness.data.catalog.logos)+" logos"],
            ["API do recebedor",readiness.data.financial.providerConnected,
              readiness.data.financial.providerConnected?"Conexão de leitura confirmada":"Aguardando teste"],
            ["Webhook cadastrado",readiness.data.financial.webhookRegistered,
              readiness.data.financial.webhookRegistered?"Habilitado no recebedor":"Não confirmado"],
            ["Ambiente da conta",readiness.data.financial.environmentMatched,
              readiness.data.financial.environmentMatched?"Configuração compatível":"Rever produção/sandbox"],
            ["Conta autorizada",readiness.data.financial.accountAuthorized,
              readiness.data.financial.accountAuthorized?"Aprovada":"Validação pendente"],
            ["Emissão de Pix",readiness.data.financial.paymentEnabled,
              readiness.data.financial.paymentEnabled?"Liberada":"Bloqueada por segurança"],
            ["Ativação após pagamento",readiness.data.supplierLiveEnabled,
              readiness.data.supplierLiveEnabled?"Liberada":"Bloqueada por segurança"],
            ["Pedidos registrados",true,
              String(readiness.data.financial.orderCount??0)+" Pix / "+String(readiness.data.financial.eventCount??0)+" eventos"],
          ].map(([label,ok,detail])=><div key={String(label)} className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <p className="text-xs font-bold">{String(label)}</p>
            <p className={"mt-1 text-xs "+(ok?"text-emerald-500":"text-amber-500")}>{String(detail)}</p>
          </div>)}
        </div>}
      <p className="text-xs text-muted-foreground">Essa verificação não envia MAC ao fornecedor, não cobra valores e não altera cadastros. O checkout real permanece indisponível até validação financeira completa.</p>
    </Card>
    <Card className="space-y-3 rounded-2xl border-blue-400/25 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold"><Wallet size={18} className="text-blue-400"/> Pix de ativações — conta separada</h2>
        <Badge variant="outline" className="border-amber-400/30 text-amber-500">Cobranças desativadas</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Integração independente para uma nova conta de recebimentos, autorizada pelo titular.
        Não usa a conta antiga nem o Pix das assinaturas. Backend e registros exclusivos na Cloudflare.
      </p>
      <p className="text-xs font-semibold">Integração isolada, com credenciais protegidas na Cloudflare.</p>
      <label htmlFor="new-payments-webhook" className="block text-xs font-semibold">Webhook para cadastrar na nova conta de recebimentos</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="new-payments-webhook" readOnly value="https://pagamentos.streammonitor.site/eventos/pagamentos"
          className="min-w-0 flex-1 rounded-xl font-mono text-xs"/>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => {
          void navigator.clipboard.writeText("https://pagamentos.streammonitor.site/eventos/pagamentos")
            .then(() => toast.success("URL do webhook copiada."))
            .catch(() => toast.error("Copie a URL manualmente."));
        }}>Copiar URL</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        As credenciais da nova conta já devem estar protegidas como secrets no Worker correspondente. Não compartilhe a chave de API ou o token do webhook.
      </p>
    </Card>
    <div className="flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"/>
      <div><p className="text-sm font-bold">Confira seu preço antes de liberar as ativações</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          O valor bruto do fornecedor pode representar créditos. O preço da loja exibido abaixo é o valor de venda ao cliente no site e Telegram. O Pix só será liberado depois da verificação da integração financeira.
        </p></div>
    </div>
    <Card className="overflow-hidden rounded-2xl border-border/70">
      <div className="flex flex-col gap-4 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div><h2 className="text-lg font-extrabold">Catálogo e preços de venda</h2>
          <p className="mt-1 text-xs text-muted-foreground">Todos os aplicativos com preço válido da API aparecem no catálogo. Valores manuais ficam guardados para consultas futuras • Cloudflare D1</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>void query.refetch()} disabled={query.isFetching}
            className="gap-2 rounded-xl"><RefreshCcw size={16} className={query.isFetching?"animate-spin":""}/>Recarregar tela</Button>
          <Button onClick={()=>void syncCatalog()} disabled={syncing}
            className="gap-2 rounded-xl"><RefreshCcw size={16} className={syncing?"animate-spin":""}/>
            {syncing?"Importando...":"Sincronizar API agora"}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 p-4">
        <div className="relative min-w-[210px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16}/>
          <Input placeholder="Buscar pelo nome do aplicativo..." className="h-10 rounded-xl pl-9"
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="flex gap-2">
          {[["all","Todos"],["missing","Sem preço"],["withLogo","Com foto"]].map(([key,label])=>
            <Button key={key} size="sm" variant={filter===key?"default":"outline"}
              className="rounded-xl" onClick={()=>setFilter(key as typeof filter)}>{label}</Button>)}
        </div>
      </div>
      <div className="hidden grid-cols-[minmax(200px,1fr)_145px_190px_150px] gap-3 border-b bg-muted/30 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground lg:grid">
        <span>Aplicativo</span><span>Valor na API*</span><span>Valor manual (inativo)</span><span className="text-right">Salvar</span>
      </div>
      {query.isLoading?<p className="p-8 text-center text-sm text-muted-foreground">Carregando aplicativos diretamente da Cloudflare...</p>:
        query.isError?<div className="space-y-3 p-6 text-center"><p className="text-sm text-destructive">Não foi possível consultar os aplicativos. Verifique sua sessão de administrador.</p>
          <Button variant="outline" onClick={()=>void query.refetch()}>Tentar novamente</Button></div>:
        !filtered.length?<p className="p-10 text-center text-sm text-muted-foreground">Nenhum aplicativo encontrado.</p>:
        <div>{filtered.map(a=><AdminRow key={a.id} app={a} save={save} isSaving={busy===a.id}/>)}</div>}
      <div className="border-t border-border/70 p-4 text-xs text-muted-foreground">
        Mostrando {filtered.length} de {apps.length} aplicativos. *O valor bruto da API pode ser expresso em créditos; o campo “Loja” representa o preço divulgado pelo fornecedor.
        {query.data?.sync?.catalog_last_complete_sync_ms && <p className="mt-2">
          Última importação completa: {new Date(Number(query.data.sync.catalog_last_complete_sync_ms)).toLocaleString("pt-BR")} —
          {" "+(query.data.sync.catalog_last_complete_import_count||"0")+" aplicativos"}
          {" • "+(query.data.sync.catalog_last_complete_pages||"?")+" páginas"}
        </p>}
      </div>
    </Card>
    <Link to="/app" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16}/>Voltar ao painel</Link>
  </div>;
}
