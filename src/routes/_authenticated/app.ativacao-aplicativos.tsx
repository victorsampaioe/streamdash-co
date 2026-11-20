import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone, Search, ShieldCheck, Clock3, ArrowRight, AlertTriangle,
  CheckCircle2, RefreshCw, History, CreditCard, Tv2, LockKeyhole, Zap
} from "lucide-react";
import { toast } from "sonner";
import { isNormalizedActivationMac } from "@/lib/activation-mac";

export const Route = createFileRoute("/_authenticated/app/ativacao-aplicativos")({
  head: () => ({
    meta: [
      { title: "Ativação de Aplicativos | Stream Monitor" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AppActivationPage,
});

const API = "https://streammonitor-app-activations.victorsampaio133.workers.dev";
const PAYMENTS_API = "https://pagamentos.streammonitor.site";
type CatalogApp = { id: string; name: string; module: string | null; logoUrl: string | null; priceCents: number | null };
type Catalog = { items: CatalogApp[]; configured: boolean; live: boolean; canary?: boolean; supplierUnavailable?: boolean };
type Item = { id: string; appName: string; mac: string; status: string; createdAt: number; providerId: string | null; expiresAt: string | null };
type PixOrder = {orderId:string;appId:string;mac:string;amountCents:number;status:string;supplierState?:string;pix?:string|null;qrImage?:string|null;expiresAt?:string|null};
const money = (cents: number | null) => cents != null && cents > 0
  ? (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  : "Preço em configuração";
const macFormat = (value: string) => {
  const hex = value.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 12);
  return (hex.match(/.{1,2}/g) || []).join(":");
};
const validMac = isNormalizedActivationMac;
async function edge<T>(path: string, init?: RequestInit, base = API): Promise<T> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("Entre na sua conta para continuar.");
  const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!publicKey) throw new Error("Sessão do site indisponível.");
  const response = await fetch(base + path, {
    ...init,
    headers: {
      "Authorization": "Bearer " + session.access_token,
      "x-sm-public-key": publicKey,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error || "Não foi possível acessar as ativações.");
  return json as T;
}
function statusLabel(status: string) {
  return ({
    awaiting_payment: "Aguardando pagamento", paid_pending_activation: "Pagamento confirmado",
    submitting: "Em processamento", submitted: "Aguardando ativação",
    activated: "Ativado", incorrect: "Dados incorretos",
    failed: "Falha", needs_review: "Em análise", refunded: "Estornado",
    cancelled: "Cancelado",
  } as Record<string, string>)[status] || "Em análise";
}
function PixLiveProgress({order, refreshing, hasError}: {
  order: PixOrder; refreshing: boolean; hasError: boolean;
}) {
  const review = ["needs_review", "incorrect", "failed"].includes(order.status);
  const finished = ["activated", "refunded", "cancelled"].includes(order.status);
  const activated = order.status === "activated";
  const supplierAccepted = activated || order.status === "submitted";
  const paid = supplierAccepted || order.status === "paid_pending_activation";
  const phase = activated ? 3 : supplierAccepted ? 2 : paid ? 1 : 0;
  const steps = [
    { title: "Pix gerado", detail: "Pedido registrado com segurança" },
    { title: paid ? "Pagamento confirmado" : "Aguardando pagamento", detail: paid ? "A Asaas reconheceu o pagamento" : "Reconhecimento automático da Asaas" },
    { title: supplierAccepted ? "Solicitação enviada" : "Aguardando envio para ativação", detail: supplierAccepted ? "Fornecedor recebeu seu pedido" : "Enviado somente após confirmar o Pix" },
    { title: activated ? "Aplicativo ativado!" : "Aguardando ativação", detail: activated ? "Licença confirmada pelo fornecedor" : "Consultando o resultado da licença" },
  ];
  return <div className="rounded-2xl border border-blue-400/20 bg-slate-950/30 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-extrabold">Acompanhamento automático</p>
      {activated ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-500"><CheckCircle2 size={15}/> Ativado</span>
      : finished ? <span className="text-xs font-semibold text-amber-500">{statusLabel(order.status)}</span>
      : <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-400">
          <span className="h-2 w-2 rounded-full bg-blue-400 motion-safe:animate-pulse"/>
          {refreshing ? "Conferindo..." : "Atualização automática"}
        </span>}
    </div>
    {review ? <div role="status" className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-500">
      <span className="font-bold">Pedido em análise.</span> O resultado precisa de conferência. Não gere outro Pix nem solicite outra ativação para o mesmo MAC.
    </div> : null}
    <div className="mt-4 space-y-3" aria-label="Etapas da ativação">
      {steps.map((step, index) => {
        const done = !review && (index === 0 || index <= phase);
        const active = !review && !finished && index === phase + 1;
        return <div key={index} className="flex items-start gap-3">
          <div className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors " +
            (done ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
              : active ? "border-blue-400/40 bg-blue-400/15 text-blue-400"
              : "border-border/70 bg-muted/30 text-muted-foreground")}>
            {done ? <CheckCircle2 size={17}/> : active
              ? <RefreshCw size={16} className="motion-safe:animate-spin"/>
              : <Clock3 size={16}/>}
          </div>
          <div className="min-w-0 pt-0.5">
            <p className={"text-xs font-bold " + (done ? "text-emerald-500" : active ? "text-foreground" : "text-muted-foreground")}>{step.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{step.detail}</p>
          </div>
        </div>;
      })}
    </div>
    {activated && <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-500">
      <CheckCircle2 size={17} className="mr-1.5 inline"/> Sua licença foi confirmada como ativada.
    </div>}
    {hasError && !activated && <p role="status" className="mt-3 text-xs text-amber-500">
      A consulta automática falhou agora. O pedido continua salvo e a próxima consulta tentará novamente.
    </p>}
    <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
      A tela consulta o pedido automaticamente enquanto estiver aberta. Você não precisa atualizar a página, pagar de novo ou reenviar o MAC.
    </p>
  </div>;
}
function AppActivationPage() {
  const cache = useQueryClient();
  const [tab, setTab] = useState<"catalogo" | "historico">("catalogo");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogApp | null>(null);
  const [mac, setMac] = useState("");
  const [ack, setAck] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [purchaseId,setPurchaseId]=useState("");
  const [pixOrder,setPixOrder]=useState<PixOrder|null>(null);
  const lastNotifiedStatus = useRef("");
  const orderId = pixOrder?.orderId ?? "";
  const {data: livePixStatus, isFetching: checkingPix, isError: pixPollingError, refetch: refetchPixStatus} = useQuery({
    queryKey: ["activation-pix-auto-status", orderId],
    queryFn: () => edge<PixOrder>("/v1/pix/status?orderId=" + encodeURIComponent(orderId), undefined, PAYMENTS_API),
    enabled: Boolean(selected && orderId),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.status ?? pixOrder?.status;
      if (["activated", "refunded", "cancelled", "incorrect", "failed"].includes(status ?? "")) return false;
      if (status === "needs_review") return 30_000;
      return ["submitted", "paid_pending_activation"].includes(status ?? "") ? 12_000 : 10_000;
    },
  });
  useEffect(() => {
    if (!livePixStatus || !orderId || livePixStatus.orderId !== orderId) return;
    const signature = [orderId, livePixStatus.status, livePixStatus.supplierState ?? ""].join(":");
    const previousStatus = pixOrder?.status;
    const previousSupplier = pixOrder?.supplierState;
    setPixOrder(current => {
      if (!current || current.orderId !== livePixStatus.orderId) return current;
      if (current.status === livePixStatus.status && current.supplierState === livePixStatus.supplierState) return current;
      return {...current, ...livePixStatus, pix: livePixStatus.pix ?? current.pix,
        qrImage: livePixStatus.qrImage ?? current.qrImage};
    });
    if (lastNotifiedStatus.current === signature) return;
    lastNotifiedStatus.current = signature;
    if (previousStatus === livePixStatus.status && previousSupplier === livePixStatus.supplierState) return;
    if (livePixStatus.status === "activated") {
      toast.success("Aplicativo ativado! O fornecedor confirmou a licença.");
    } else if (livePixStatus.status === "submitted") {
      toast.success("Pix confirmado. A solicitação foi recebida pelo fornecedor.");
    } else if (livePixStatus.status === "paid_pending_activation") {
      toast.success("Pix confirmado! Aguardando envio ao fornecedor.");
    } else if (livePixStatus.status === "needs_review") {
      toast.warning("Pedido em análise. Não gere outro Pix para o mesmo MAC.");
    }
    void cache.invalidateQueries({queryKey: ["activation-pix-orders"]});
    void cache.invalidateQueries({queryKey: ["ativeapp-history"]});
  }, [livePixStatus, orderId, pixOrder?.status, pixOrder?.supplierState, cache]);

  const { data: catalog, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ativeapp-catalog"],
    queryFn: () => edge<Catalog>("/v1/catalog"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["ativeapp-history"],
    queryFn: () => edge<{ items: Item[] }>("/v1/history"),
    enabled: tab === "historico",
    staleTime: 30_000,
    retry: 1,
  });
  const {data:previousOrders,isLoading:ordersLoading}=useQuery({
    queryKey:["activation-pix-orders"],
    queryFn:()=>edge<{items:Array<PixOrder & {createdAt:number}>}>("/v1/pix/orders",undefined,PAYMENTS_API),
    enabled:tab==="historico",staleTime:30_000,retry:1,
  });
  const live = catalog?.live === true;
  const list = catalog?.items ?? [];
  const filtered = list.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()));
  const ready = !!selected && validMac(mac) && ack && live &&
    Number(selected.priceCents) > 0;
  async function submit() {
    if (!ready || sending || !selected) return;
    const requestId=purchaseId||crypto.randomUUID();
    setPurchaseId(requestId);
    setSending(true);
    try {
      const data=await edge<PixOrder>("/v1/pix/create",{
        method:"POST",body:JSON.stringify({appId:selected.id,mac,requestId,acknowledged:true})
      },PAYMENTS_API);
      lastNotifiedStatus.current = [data.orderId, data.status, data.supplierState ?? ""].join(":");
      setPixOrder(data);
      toast.success("Pix gerado. A verificação automática está ativa.");
    }catch(error){
      toast.error(error instanceof Error?error.message:"Não foi possível confirmar o Pix. Confira Meus pedidos antes de tentar novamente.");
    }finally{setSending(false);}
  }
  async function verifyPix() {
    if (!pixOrder || checkingPix) return;
    const result = await refetchPixStatus();
    if (result.error) {
      toast.error("Não foi possível consultar o pedido agora. A atualização automática continuará tentando.");
    } else if (result.data?.status === pixOrder.status && result.data?.supplierState === pixOrder.supplierState) {
      toast.info("Nenhuma mudança até agora. O acompanhamento automático continua ativo.");
    }
  }
  return <div className="mx-auto max-w-7xl space-y-7 pb-16">
    <header className="relative overflow-hidden rounded-[28px] border border-blue-400/20 bg-gradient-to-br from-[#091427] via-[#102345] to-[#151d4d] px-6 py-8 text-white shadow-xl sm:px-9 sm:py-11">
      <div className="absolute -right-16 -top-28 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true"/>
      <div className="absolute bottom-0 right-[28%] h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" aria-hidden="true"/>
      <div className="relative z-10">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.18em] text-blue-200">
          <Zap size={14}/> Nova área · Stream Monitor
        </div>
        <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          Ativação de <span className="text-blue-300">Aplicativos</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100/80 sm:text-base">
          Escolha seu reprodutor de mídia, confira o MAC do dispositivo e acompanhe sua ativação. Tudo em uma única central.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold"><ShieldCheck size={15}/> Processo protegido</span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold"><Smartphone size={15}/> Apenas MAC</span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold"><Clock3 size={15}/> Acompanhe no histórico</span>
        </div>
      </div>
    </header>
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 md:col-span-2">
        <p className="flex items-center gap-2 text-sm font-extrabold text-amber-500"><AlertTriangle size={18}/> Confira o MAC antes de ativar</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Digite exatamente o MAC exibido no aplicativo da TV. Ativações enviadas com MAC incorreto não têm estorno. Revise também o nome do aplicativo antes da confirmação.
        </p>
      </div>
      <div className="rounded-2xl border border-blue-400/20 bg-blue-400/5 p-4">
        <p className="flex items-center gap-2 text-sm font-bold"><LockKeyhole size={17} className="text-blue-400"/> Licenças de aplicativos</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Não inclui canais, filmes, séries ou assinatura de conteúdo.
        </p>
      </div>
    </div>
    {catalog?.canary && <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <p className="font-extrabold text-amber-500">Teste restrito ao administrador — Pix real</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        O checkout está aberto apenas para homologação. Gerar um Pix cria uma cobrança real na conta vinculada.
        Não pague nem compartilhe o código antes de confirmar o recebedor, o valor e a entrega da licença.
        Clientes comuns ainda não podem comprar.
      </p>
    </div>}
    {!live && <div className="flex flex-col gap-2 rounded-2xl border border-blue-400/20 bg-blue-400/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-sm font-bold">Integração em preparação</p>
        <p className="mt-1 text-xs text-muted-foreground">O catálogo está disponível para conferir aplicativos e MAC. O Pix e a ativação automática estão em validação. Nenhum valor será cobrado nesta prévia.</p>
      </div><Badge variant="outline" className="w-fit border-blue-400/30 text-blue-400">Sem cobranças</Badge>
    </div>}
    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-3">
      <Button type="button" variant={tab === "catalogo" ? "default" : "outline"} onClick={() => setTab("catalogo")} className="gap-2 rounded-xl"><Tv2 size={16}/> Aplicativos</Button>
      <Button type="button" variant={tab === "historico" ? "default" : "outline"} onClick={() => setTab("historico")} className="gap-2 rounded-xl"><History size={16}/> Minhas ativações</Button>
    </div>
    {tab === "catalogo" ? <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Escolha seu aplicativo</h2>
          <p className="mt-1 text-xs text-muted-foreground">{!catalog?.configured ? "Catálogo disponível após conexão com o fornecedor" : list.length + " aplicativos com preço definido pelo Stream Monitor"}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1 sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <Input aria-label="Buscar aplicativos" placeholder="Buscar aplicativo..." className="h-10 rounded-xl pl-9" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <Button variant="outline" title="Atualizar catálogo" aria-label="Atualizar catálogo" className="h-10 w-10 rounded-xl p-0" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw size={17} className={isFetching ? "animate-spin" : ""}/>
          </Button>
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Não foi possível consultar a Cloudflare. Tente atualizar a página.</div>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando catálogo da Cloudflare...</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((app, index) => <Card key={app.id} className="group relative overflow-hidden rounded-[22px] border border-border/70 bg-card/95 p-5 transition-colors hover:border-blue-400/40">
          <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-blue-500/5 blur-2xl" aria-hidden="true"/>
          <div className="mb-5 flex items-start justify-between">
            <div className={"flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-white/10 text-xl font-black text-white " +
              (index % 4 === 0 ? "bg-gradient-to-br from-blue-600 to-indigo-900" : index % 4 === 1 ? "bg-gradient-to-br from-violet-600 to-fuchsia-900" : index % 4 === 2 ? "bg-gradient-to-br from-teal-600 to-blue-900" : "bg-gradient-to-br from-slate-600 to-blue-900")}>
              {app.logoUrl ? <img src={app.logoUrl} alt="" className="h-full w-full object-contain" loading="lazy"/> : app.name.slice(0,2)}
            </div>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-500">Licença de app</span>
          </div>
          <h3 className="min-h-11 text-sm font-extrabold tracking-wide">{app.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{app.module || "Reprodutor de mídia"}</p>
          <div className="mt-5 border-t border-border/70 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor da ativação</p>
            <p className="mt-1 text-lg font-black">{money(app.priceCents)}</p>
          </div>
          <Button type="button" disabled={!app.priceCents} className="mt-4 w-full gap-2 rounded-xl" onClick={() => { setSelected(app); setMac(""); setAck(false); setReviewing(false); setPixOrder(null); setPurchaseId(""); }}>
            <Zap size={16}/>{live ? "Selecionar" : "Conferir MAC (prévia)"} <ArrowRight size={15}/>
          </Button>
        </Card>)}
      </div>
      {!filtered.length && <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">Nenhum aplicativo liberado com preço definido. Outros aplicativos aparecerão aqui quando o administrador cadastrar seus valores.</div>}
    </> : <section className="space-y-4">
      <div><h2 className="text-xl font-bold">Histórico de ativações</h2><p className="mt-1 text-xs text-muted-foreground">Resultados da sua conta, sem mostrar ativações de outros usuários.</p></div>
      <Card className="space-y-3 rounded-2xl p-4">
        <h3 className="font-bold">Meus pedidos Pix</h3>
        {ordersLoading?<p className="text-xs text-muted-foreground">Consultando pedidos...</p>:
          !previousOrders?.items?.length?<p className="text-xs text-muted-foreground">Nenhum Pix gerado ainda.</p>:
          previousOrders.items.map(order=><div key={order.orderId}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 py-3">
            <div className="text-xs">
              <p><strong>{money(order.amountCents)}</strong> — <code>{order.mac}</code></p>
              <p className="mt-1 text-muted-foreground">{statusLabel(order.supplierState==="accepted"?"submitted":order.status)} • {new Date(order.createdAt).toLocaleString("pt-BR")}</p>
            </div>
            <Button size="sm" variant="outline" onClick={async()=>{
              try{
                const updated=await edge<PixOrder>("/v1/pix/status?orderId="+encodeURIComponent(order.orderId),
                  undefined,PAYMENTS_API);
                const match=list.find(x=>x.id===order.appId);
                setSelected(match||{id:order.appId,name:"Aplicativo",module:null,logoUrl:null,priceCents:order.amountCents});
                setMac(order.mac);setReviewing(true);setAck(true);setPixOrder(updated);
              }catch(e){toast.error(e instanceof Error?e.message:"Não foi possível abrir o pedido.");}
            }}>Ver pedido</Button>
          </div>)}
      </Card>
      {historyLoading ? <p className="text-sm text-muted-foreground">Consultando histórico...</p> :
        !history?.items?.length ? <Card className="flex flex-col items-center gap-3 rounded-2xl border-dashed p-12 text-center">
          <History size={32} className="text-muted-foreground"/><p className="font-semibold">Nenhuma ativação solicitada</p><p className="text-xs text-muted-foreground">Quando suas ativações começarem, o acompanhamento aparecerá aqui.</p>
        </Card> : <div className="space-y-3">{history.items.map(item => <Card key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4">
          <div><p className="font-semibold">{item.appName}</p><p className="mt-1 font-mono text-xs text-muted-foreground">MAC: {item.mac}</p>
            <p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("pt-BR")}</p></div>
          <Badge variant="outline">{statusLabel(item.status)}</Badge>
        </Card>)}</div>}
    </section>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Confirmar ativação">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[26px] border border-blue-400/25 p-6 shadow-2xl sm:p-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15"><Smartphone size={24} className="text-blue-400"/></div>
        <h2 className="text-2xl font-extrabold">{live ? "Confirmar ativação" : "Prévia da ativação"}</h2>
        <p className="mt-2 text-sm text-muted-foreground">Aplicativo: <strong className="text-foreground">{selected.name}</strong></p>
        <div className="mt-5 space-y-2">
          <label htmlFor="activation-mac" className="text-xs font-bold uppercase tracking-wider">MAC do dispositivo</label>
          <Input id="activation-mac" placeholder="AA:BB:CC:DD:EE:FF" autoComplete="off" className="h-12 font-mono text-base tracking-wider" value={mac} disabled={!!pixOrder} onChange={e => { setMac(macFormat(e.target.value)); setReviewing(false); }}/>
          <p className="text-xs text-muted-foreground">Informe somente o MAC exibido no aplicativo. Não é necessária Device KEY.</p>
        </div>
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold text-amber-500"><AlertTriangle size={17}/> Atenção: não há estorno</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Confira cuidadosamente o aplicativo e cada caractere do MAC. Não envie informações incorretas.</p>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={ack} disabled={!!pixOrder} onChange={e => setAck(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-500"/>
          <span>Conferi o MAC e o aplicativo e estou ciente de que <strong>não haverá estorno por dados incorretos</strong>.</span>
        </label>
        {pixOrder && <div className="mt-5 space-y-3 rounded-2xl border border-blue-400/25 bg-blue-500/5 p-4">
          <p className="text-sm font-bold">Seu pedido — {statusLabel(pixOrder.status)}</p>
          <PixLiveProgress order={pixOrder} refreshing={checkingPix} hasError={pixPollingError}/>
          <p className="text-xs text-muted-foreground">Valor: <strong>{money(pixOrder.amountCents)}</strong> • MAC: <code>{pixOrder.mac}</code></p>
          {pixOrder.status === "awaiting_payment" && pixOrder.qrImage&&<img className="mx-auto h-48 w-48 bg-white p-2" alt="QR Code Pix da cobrança"
            src={"data:image/png;base64,"+pixOrder.qrImage}/>}
          {pixOrder.status === "awaiting_payment" && pixOrder.pix&&<div className="space-y-2">
            <label className="text-xs font-semibold">Pix Copia e Cola</label>
            <Input readOnly aria-label="Código Pix Copia e Cola" value={pixOrder.pix} className="font-mono text-xs"/>
            <Button type="button" variant="outline" className="w-full" onClick={()=>{
              void navigator.clipboard.writeText(pixOrder.pix||"")
                .then(()=>toast.success("Código Pix copiado."))
                .catch(()=>toast.error("Copie o código manualmente."));
            }}>Copiar Pix</Button>
          </div>}
          {pixOrder.status !== "activated" && <Button type="button" variant="outline" disabled={checkingPix}
            onClick={()=>void verifyPix()} className="w-full gap-2">
            <RefreshCw size={16} className={checkingPix ? "motion-safe:animate-spin" : ""}/>
            {checkingPix?"Conferindo automaticamente...":"Atualizar status agora (opcional)"}
          </Button>}
          <p className="text-xs text-amber-500">Não gere outro Pix para este pedido. A licença só é solicitada após confirmação do pagamento.</p>
        </div>}
        {reviewing && <div className="mt-4 rounded-xl border border-blue-400/30 bg-blue-400/5 p-3 text-xs">
          <p className="font-bold">Última conferência</p><p className="mt-1">App: {selected.name}</p><p>MAC: <span className="font-mono font-bold">{mac}</span></p><p>Preço: {money(selected.priceCents)}</p>
          {!live && <p className="mt-2 font-semibold text-amber-500">Somente conferência: nenhum Pix será gerado e nenhuma ativação será enviada.</p>}
        </div>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => {setSelected(null);setReviewing(false);}} disabled={sending} className="rounded-xl sm:flex-1">{pixOrder?"Fechar":"Cancelar"}</Button>
          {pixOrder?null:!reviewing ? <Button disabled={!validMac(mac) || !ack} className="gap-2 rounded-xl sm:flex-1" onClick={() => setReviewing(true)}><ShieldCheck size={16}/> Revisar dados</Button> :
          <Button disabled={!ready || sending} onClick={() => void submit()} className="gap-2 rounded-xl sm:flex-1"><CreditCard size={16}/>{!live ? "Pix ainda indisponível" : sending ? "Gerando Pix..." : "Gerar Pix"}</Button>}
        </div>
      </Card>
    </div>}
    <footer className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 size={16} className="text-blue-400"/> Serviços de licenciamento de aplicativos. A disponibilidade e o conteúdo dependem de fornecedores externos.</footer>
  </div>;
}
