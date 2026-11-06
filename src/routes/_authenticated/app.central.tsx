import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { effectiveAccessStatus } from "@/lib/dns-state";
import { SentinelEdgePanel } from "@/components/sentinel-edge-panel";
import { HistoryReportPanel } from "@/components/history-report-panel";
import { AlertDeliveryHealthPanel } from "@/components/alert-delivery-health-panel";
import { supabase } from "@/integrations/supabase/client";
import { getFinancialPulse } from "@/lib/operations-finance.functions";
import { prioritizeStaleServersNow } from "@/lib/monitor-health.functions";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, ClipboardList, Download, Radar, RefreshCw, ShieldCheck, TrendingUp, Wallet, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/central")({
  component: OperationsCenter,
  head: () => ({ meta: [{ title: "Central Inteligente | Stream Monitor" }] }),
});
type ServerItem = {
 id: string; name: string; host: string; current_status: string | null;
 dns_status: string | null; dns_enabled: boolean | null; last_checked_at: string | null;
 last_dns_check_at: string | null; last_latency_ms: number | null;
 health_score: number | null; dns_health_score: number | null;
 monitoring_paused: boolean | null; next_check_at: string | null;
};
type IncidentItem = { id: string; server_id: string; reason: string | null; started_at: string; ended_at: string | null; alert_sent: boolean | null };
const stale = (t: string | null, minutes = 5) => !t || Date.now() - new Date(t).getTime() > minutes * 60000;
const date = (t: string | null) => t ? new Date(t).toLocaleString("pt-BR") : "Não verificado";
const stamp = () => new Date().toLocaleString("pt-BR");
const csv = (s: string) => {
  // CSV opened by Excel must never execute formulas from user-supplied names.
  const safe = /^[\s]*[=+@\-]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
};

function OperationsCenter() {
  const [tab, setTab] = useState("diagnostico");
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const financeFn = useServerFn(getFinancialPulse);
  const prioritizeStale = useServerFn(prioritizeStaleServersNow);
  const [prioritizing, setPrioritizing] = useState(false);
  const query = useQuery({
    queryKey: ["operations-center"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Faça login para continuar.");
      const { data: roles, error: rolesError } = await supabase.from("user_roles")
        .select("role").eq("user_id", user.user.id);
      if (rolesError) throw new Error(rolesError.message);
      const isAdmin = !!roles?.some(r => r.role === "admin");
      // Administradores precisam ver a operação inteira. A tabela já usa
      // políticas RLS específicas para admin; usuários comuns só a própria.
      let serversQuery = supabase.from("servers")
        .select("id,name,host,current_status,dns_status,dns_enabled,last_checked_at,last_dns_check_at,last_latency_ms,health_score,dns_health_score,monitoring_paused,next_check_at")
        .order("created_at", { ascending: false }).limit(1000);
      if (!isAdmin) serversQuery = serversQuery.eq("owner_id", user.user.id);
      const [{ data: servers, error: sErr }, { data: channels, error: aErr }] = await Promise.all([
        serversQuery,
        supabase.from("alert_channels").select("id").eq("owner_id", user.user.id).eq("kind", "telegram").eq("enabled", true).limit(1),
      ]);
      if (sErr) throw new Error(sErr.message);
      if (aErr) throw new Error(aErr.message);
      const ids = (servers ?? []).map(s => s.id);
      let incidents: IncidentItem[] = [];
      let openIncidentCount = 0;
      if (ids.length) {
        // PostgREST URL/query limits: use page batches rather than 292 ids
        // inside one in(...) query. Sort combined results globally.
        const batches: string[][] = [];
        for (let i = 0; i < ids.length; i += 75) batches.push(ids.slice(i, i + 75));
        const results = await Promise.all(batches.map(async batch => {
          const [history, openCount] = await Promise.all([
            supabase.from("incidents")
              .select("id,server_id,reason,started_at,ended_at,alert_sent")
              .in("server_id", batch).order("started_at", { ascending: false }).limit(100),
            supabase.from("incidents")
              .select("id", { count: "exact", head: true })
              .in("server_id", batch).is("ended_at", null),
          ]);
          if (history.error) throw new Error(history.error.message);
          if (openCount.error) throw new Error(openCount.error.message);
          return { history: (history.data ?? []) as IncidentItem[], open: openCount.count ?? 0 };
        }));
        for (const result of results) {
          incidents.push(...result.history);
          openIncidentCount += result.open;
        }
        incidents = incidents.sort((a,b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        ).slice(0,100);
      }
      return { servers: (servers ?? []) as ServerItem[], incidents, openIncidentCount,
        telegram: (channels ?? []).length > 0, isAdmin,
        limited: (servers ?? []).length === 1000, incidentLimited: incidents.length === 100 };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  const finance = useQuery({
    queryKey: ["operations-finance"],
    enabled: !!query.data?.isAdmin && tab === "financeiro",
    queryFn: () => financeFn(),
    refetchInterval: 60_000,
  });
  const servers = query.data?.servers ?? [];
  const incidents = query.data?.incidents ?? [];
  const anomalies = useMemo(() => servers.filter(s => !s.monitoring_paused && (s.dns_status === "offline" || effectiveAccessStatus(s) === "down" || stale(s.last_checked_at, 15) || (s.dns_enabled && stale(s.last_dns_check_at, 10)))), [servers, query.dataUpdatedAt]);
  const items = [
    ["diagnostico","Diagnóstico"],["incidentes","Incidentes"],["sentinel","Sentinel"],
    ["comparador","Comparador"],["relatorio","Relatórios"],["primeiros","Primeiros passos"],
    ...(query.data?.isAdmin ? [["financeiro","Receita e Pix"]] : []),
  ];

  function reportCsv() {
    const header = ["Servidor","DNS","HTTP","Health","Latência ms","Última checagem"];
    const rows = servers.map(s => [s.name,s.dns_status ?? "unknown",s.current_status ?? "unknown",String(s.health_score ?? ""),String(s.last_latency_ms ?? ""),s.last_checked_at ?? ""]);
    const text = [header,...rows].map(row => row.map(csv).join(";")).join("\r\n");
    const blob = new Blob(["\ufeff"+text], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="stream-monitor-relatorio.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  const find = (id: string) => servers.find(s => s.id === id);
  const diagnostic = (s: ServerItem) => {
    if (s.monitoring_paused) return { kind:"Pausado",why:"Monitoramento pausado. Verifique sua assinatura e as configurações.",color:"text-muted-foreground" };
    if (s.dns_enabled !== false && stale(s.last_dns_check_at, 15)) return {kind:"DNS sem dados recentes",why:"A última consulta DNS está atrasada. Não é seguro afirmar que o domínio continua offline sem uma nova verificação.",color:"text-amber-500"};
    if (s.dns_status === "offline" && s.dns_enabled !== false) return {
      kind:"DNS OFFLINE — domínio indisponível",
      why:"O DNS está offline confirmado. O servidor IPTV pode continuar respondendo por IP; a falha de acesso pelo domínio é real.",
      color:"text-red-400"
    };
    if (stale(s.last_checked_at,15)) return {kind:"Dados de serviço atrasados",why:"A verificação de serviço está atrasada; valide o agendador. O estado do DNS é mostrado separadamente.",color:"text-amber-500"};
    if (s.current_status === "down") return {kind:"Servidor offline",why:"A última verificação marcou o servidor indisponível. Confira a linha do tempo e as regiões.",color:"text-red-400"};
    if (s.dns_status === "unstable" || s.current_status === "degraded") return {kind:"Instabilidade",why:"Há falhas parciais. Compare a latência e aguarde confirmação.",color:"text-amber-500"};
    return {kind:"Sem falha recente",why:"Os indicadores conhecidos estão normais. Isso não garante disponibilidade contínua.",color:"text-emerald-500"};
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary"/> Central Inteligente</h1><p className="text-sm text-muted-foreground">Diagnóstico, Sentinel, incidentes, comparações e relatórios com os dados reais do seu monitoramento.</p></div>
      <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching?"animate-spin":""}`}/>Atualizar</Button>
    </div>
    {query.isLoading && <Card className="p-5">Buscando dados da operação...</Card>}
    {query.isError && <Card className="p-5 text-destructive">Falha ao carregar. {query.error?.message}</Card>}
    {!!query.data && <>
      <p className="text-xs text-muted-foreground">{query.data.isAdmin ? "Visão administrativa — todos os servidores" : "Sua operação — servidores da sua conta"} · Atualizado em {new Date(query.dataUpdatedAt).toLocaleTimeString("pt-BR")}</p>
      {query.data.limited && <p className="text-xs text-amber-500">Exibindo até 1.000 servidores. O relatório não representa a base inteira.</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Servidores</p><p className="text-2xl font-bold">{servers.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">DNS offline</p><p className="text-2xl font-bold">{servers.filter(s=>!s.monitoring_paused && s.dns_enabled !== false && s.dns_status==="offline").length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Incidentes abertos</p><p className="text-2xl font-bold">{query.data.openIncidentCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Checagens atrasadas</p><p className="text-2xl font-bold">{servers.filter(s=>!s.monitoring_paused&&stale(s.last_checked_at,15)).length}</p></Card>
      </div>
      <div className="flex flex-wrap gap-2">{items.map(([id,label])=><Button key={id} size="sm" variant={tab===id?"default":"outline"} onClick={()=>setTab(id)}>{label}</Button>)}</div>

      {tab==="diagnostico" && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Diagnóstico explicável com base nos estados registrados. Não substitui uma nova sonda.</p>
        {servers.length===0 && <Card className="p-5">Cadastre o primeiro servidor para ver o diagnóstico.</Card>}
        {servers.map(s=>{const d=diagnostic(s);return <Card key={s.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{s.name}</p><p className="text-xs text-muted-foreground">{s.host}</p></div><Badge>{d.kind}</Badge></div>
          <p className={`mt-2 text-sm ${d.color}`}>{d.why}</p><p className="mt-2 text-xs text-muted-foreground">Verificado: {date(s.last_checked_at)} · DNS: {s.dns_status ?? "desconhecido"}</p>
          <Link to="/app/servers/$id" params={{id:s.id}} className="text-sm text-primary underline">Abrir detalhes</Link>
        </Card>})}
      </div>}

      {tab==="incidentes" && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Histórico dos 100 incidentes mais recentes. {query.data.incidentLimited ? "Há mais incidentes fora deste recorte. " : ""}“Alerta registrado” não comprova entrega no Telegram.</p>
        {incidents.length===0&&<Card className="p-5">Nenhum incidente registrado.</Card>}
        {incidents.map(i=><Card key={i.id} className="p-4">
          <div className="flex flex-wrap justify-between gap-2"><strong>{find(i.server_id)?.name ?? "Servidor"}</strong><Badge>{i.ended_at?"Encerrado":"Em andamento"}</Badge></div>
          <p className="text-sm mt-2">{i.reason ?? "Sem motivo registrado"}</p>
          <p className="text-xs text-muted-foreground mt-1">Início: {date(i.started_at)} · Fim: {date(i.ended_at)} · Alerta: {i.alert_sent?"registrado":"não confirmado"}</p>
        </Card>)}
      </div>}

      {tab==="sentinel" && <div className="space-y-3">
        <SentinelEdgePanel />
        {query.data.isAdmin && <AlertDeliveryHealthPanel />}
        {query.data.isAdmin && <Card className="p-4 space-y-2">
          <h3 className="font-semibold">Recuperar checagens atrasadas</h3>
          <p className="text-sm text-muted-foreground">Prioriza servidores ativos sem checagem há mais de 15 minutos. A fila executará as verificações nas próximas rodadas; não altera status sem testar.</p>
          <Button disabled={prioritizing} onClick={async () => {
            setPrioritizing(true);
            try {
              const res = await prioritizeStale();
              toast.success(`${res.prioritized} servidores atrasados priorizados para nova verificação.`);
              await query.refetch();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Não foi possível priorizar os servidores");
            } finally { setPrioritizing(false); }
          }}>{prioritizing ? "Reorganizando fila..." : "Priorizar todos os atrasados"}</Button>
        </Card>}
        <Card className="p-4"><h2 className="font-semibold flex items-center gap-2"><Radar className="h-4 w-4 text-primary"/> Sentinel — anomalias observadas</h2><p className="text-xs text-muted-foreground mt-1">Regras determinísticas, sem previsão por IA. Não cria novas sondagens nem envia notificações automáticas.</p></Card>
        {anomalies.length===0?<Card className="p-5 flex items-center gap-2"><CheckCircle2 className="text-emerald-500 h-4 w-4"/> Nenhuma anomalia identificada pelos dados disponíveis.</Card>:
          anomalies.map(s=><Card className="p-4" key={s.id}><p className="font-medium flex items-center gap-2"><AlertTriangle className="text-amber-500 h-4 w-4"/>{s.name}</p><p className="text-sm mt-1">{diagnostic(s).why}</p><p className="text-xs text-muted-foreground">DNS: {s.dns_status ?? "?"} · HTTP: {s.current_status ?? "?"} · Última checagem: {date(s.last_checked_at)}</p></Card>)}
      </div>}

      {tab==="comparador" && <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Compare disponibilidade e tempo de resposta das últimas verificações. Valores nulos não são tratados como zero.</p>
        <div className="grid sm:grid-cols-2 gap-3">{[left,right].map((selected,index)=><select key={index} aria-label={index===0?"Primeiro servidor":"Segundo servidor"} className="w-full rounded-lg border border-border bg-background p-3" value={selected} onChange={e=>index===0?setLeft(e.target.value):setRight(e.target.value)}><option value="">Selecionar servidor</option>{servers.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>)}</div>
        {left&&right&&left!==right&&<div className="grid sm:grid-cols-2 gap-3">{[find(left),find(right)].map(s=>s&&<Card className="p-4 space-y-2" key={s.id}><h3 className="font-semibold">{s.name}</h3><p>DNS: {s.dns_status ?? "Desconhecido"}</p><p>Servidor: {s.current_status ?? "Desconhecido"} · Acesso: {effectiveAccessStatus(s)}</p><p>Health: {s.health_score==null?"Sem dados":s.health_score+"%"}</p><p>Latência: {s.last_latency_ms==null?"Sem dados":s.last_latency_ms+" ms"}</p><p className="text-xs text-muted-foreground">Última medição: {date(s.last_checked_at)}</p></Card>)}</div>}
      </div>}

      {tab==="relatorio" && <div className="space-y-3"><HistoryReportPanel servers={servers} /><Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4"/> Relatório operacional</h2>
        <p className="text-sm">Gerado em {stamp()} · {servers.length} servidores · {query.data.openIncidentCount} incidentes abertos.</p>
        <p className="text-xs text-muted-foreground">Exportação CSV dos estados atuais. Não é um certificado de SLA nem relatório histórico de 30 dias.</p>
        <Button onClick={reportCsv}><Download className="h-4 w-4 mr-2"/>Baixar CSV</Button>
        <Button variant="outline" onClick={()=>window.print()}>Imprimir / Salvar PDF</Button>
      </Card></div>}

      {tab==="primeiros" && <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4"/> Seu primeiro monitoramento</h2>
        {[
          {done:servers.length>0,title:"Cadastre seu primeiro servidor",link:"/app/servers/new"},
          {done:servers.some(s=>!!s.last_dns_check_at),title:"Aguarde sua primeira checagem DNS",link:"/app/servers"},
          {done:query.data.telegram,title:"Conecte o Telegram para receber alertas",link:"/app/alerts"},
          {done:incidents.length>0,title:"Conheça a linha do tempo de incidentes",link:"/app/central"},
        ].map((s,i)=><div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"><span className="flex items-center gap-2">{s.done?<CheckCircle2 className="h-4 w-4 text-emerald-500"/>:<Activity className="h-4 w-4 text-muted-foreground"/>}{s.title}</span><a href={s.link} className="text-sm text-primary underline">Abrir</a></div>)}
      </Card>}

      {tab==="financeiro"&&query.data.isAdmin&&<Card className="p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4"/> Receita e pendências Pix (admin)</h2>
        {finance.isLoading&&<p>Conferindo cobranças...</p>}
        {finance.isError&&<p className="text-destructive">{finance.error?.message}</p>}
        {finance.data&&<><div className="grid sm:grid-cols-3 gap-3">
          <p>Aprovados (30 dias): <strong>{finance.data.paidLast30d}</strong></p>
          <p>Pendentes (30 dias): <strong>{finance.data.pendingLast30d}</strong></p>
          <p>Receita aprovada: <strong>{(finance.data.revenueCentsLast30d/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong></p>
        </div>
        <p className="text-xs text-muted-foreground">Pagamentos aprovados com assinatura sem validade ativa requerem revisão manual: podem incluir renovação, cancelamento ou processamento anterior. Este painel não libera acesso automaticamente.</p>
        {finance.data.needsReview.map(p=><div className="rounded-lg border border-amber-500/20 p-3 text-sm" key={p.id}>Cobrança {p.id.slice(0,8)} · Plano {p.plan ?? "não identificado"} · Pago: {date(p.paidAt)}</div>)}
        {finance.data.limited&&<p className="text-xs text-amber-500">Visão parcial devido ao limite de consultas.</p>}
        <Link to="/app/admin" className="text-primary underline text-sm">Abrir admin para revisar pagamentos</Link>
        </>}
      </Card>}
    </>}
  </div>;
}
