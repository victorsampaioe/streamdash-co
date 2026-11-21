import { useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, Activity, Clock3, Search, RefreshCw, CheckCircle2, Info } from "lucide-react";

export type RadarStatus = "unknown"|"normal"|"possible"|"confirmed"|"risk"|"normalized";
export type RadarHistory = { at: string; status: RadarStatus; description: string };
export type RadarServer = {
  id: string;
  name: string;
  host: string;
  status: RadarStatus;
  confidence: "low"|"medium"|"high";
  identifiedAt: string|null;
  lastCheckedAt: string|null;
  regions: string[];
  technicalSummary: string;
  history: RadarHistory[];
};
export type RadarView = {
  lastUpdatedAt: string|null;
  servers: RadarServer[];
  verifiedOwnership: boolean;
};
const statusLabels:Record<RadarStatus,string>={
  unknown:"Não verificado",normal:"Sem bloqueio identificado",
  possible:"Possível bloqueio",confirmed:"Bloqueio confirmado",
  risk:"Risco identificado",normalized:"Acesso normalizado"
};
const statusColors:Record<RadarStatus,string>={
  unknown:"text-slate-400 border-slate-600/40 bg-slate-700/20",
  normal:"text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  possible:"text-amber-400 border-amber-500/30 bg-amber-500/10",
  confirmed:"text-red-400 border-red-500/30 bg-red-500/10",
  risk:"text-orange-400 border-orange-500/30 bg-orange-500/10",
  normalized:"text-sky-400 border-sky-500/30 bg-sky-500/10"
};
const date= (value:string|null)=>{
  if(!value)return "Ainda não verificado";
  const n=Date.parse(value);
  return Number.isFinite(n)?new Intl.DateTimeFormat("pt-BR",{
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",
    timeZone:"America/Fortaleza"
  }).format(n):"Data indisponível";
};
const cards=[
  {key:"total",label:"DNS analisadas",icon:Activity},
  {key:"normal",label:"Sem bloqueio",icon:ShieldCheck},
  {key:"possible",label:"Possíveis bloqueios",icon:AlertTriangle},
  {key:"confirmed",label:"Confirmados",icon:ShieldAlert},
  {key:"risk",label:"Em risco",icon:Clock3},
  {key:"normalized",label:"Normalizadas",icon:CheckCircle2}
] as const;

/**
 * Presentational UI only. Requires a proven tenant-scoped Cloudflare read API.
 * Never feed it a global admin array for a reseller session.
 * No vendor links, URLs, documents or source identifiers are rendered.
 */
export function RadarBloqueiosDashboard({
  snapshot,
  loading=false,
  onRefresh,
}:{
  snapshot:RadarView|null;
  loading?:boolean;
  onRefresh?:()=>void;
}){
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<RadarStatus|"all">("all");
  const [expanded,setExpanded]=useState<string|null>(null);
  const available=Boolean(snapshot?.verifiedOwnership);
  const servers=available?snapshot!.servers:[];
  const counts=useMemo(()=>({
    total:servers.filter(s=>s.status!=="unknown").length,
    normal:servers.filter(s=>s.status==="normal").length,
    possible:servers.filter(s=>s.status==="possible").length,
    confirmed:servers.filter(s=>s.status==="confirmed").length,
    risk:servers.filter(s=>s.status==="risk").length,
    normalized:servers.filter(s=>s.status==="normalized").length
  }),[servers]);
  const filtered=servers.filter(s=>(filter==="all"||s.status===filter)
    &&(s.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
      ||s.host.toLowerCase().includes(search.toLowerCase())));
  return <section className="sm-page flex flex-col gap-6">
    <header className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-950/70 via-slate-950 to-slate-950 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
            <ShieldCheck className="h-4 w-4"/> Inteligência de DNS
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Radar de Bloqueios</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
            Monitoramento de restrições de acesso, divergências entre verificações e normalização,
            separado do status de disponibilidade dos servidores.
          </p>
        </div>
        {onRefresh&&available&&<button type="button" disabled={loading} onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-200 disabled:opacity-50">
          <RefreshCw className={"h-4 w-4 "+(loading?"animate-spin":"")}/>Atualizar
        </button>}
      </div>
      <p className="mt-4 text-xs text-slate-400">Última atualização: {available?date(snapshot?.lastUpdatedAt??null):"Aguardando liberação segura"}</p>
    </header>
    {!available&&<div role="status" className="flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-200">
      <Info className="h-5 w-5 shrink-0"/>Os diagnósticos permanecem privados até a validação do acesso e das permissões desta conta.
      Nenhuma DNS será marcada como bloqueada sem evidência suficiente.
    </div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map(c=><div key={c.key} className="rounded-xl border border-blue-500/15 bg-slate-900/70 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400"><c.icon className="h-4 w-4 text-blue-400"/>{c.label}</div>
        <div className="mt-3 text-2xl font-bold tabular-nums">{available?counts[c.key]:"—"}</div>
      </div>)}
    </div>
    <div className="rounded-2xl border border-blue-500/15 bg-slate-900/50 p-4 sm:p-5">
      <h2 className="mb-4 text-base font-bold">DNS monitoradas</h2>
      {available && servers.some(s=>s.status==="unknown") && <p className="mb-4 text-xs text-amber-300">Aguardando evidências suficientes para {servers.filter(s=>s.status==="unknown").length} DNS. Falhas isoladas não são classificadas como bloqueio.</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[190px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} disabled={!available}
            placeholder="Buscar minha DNS" aria-label="Buscar DNS"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"/>
        </div>
        <select value={filter} onChange={e=>setFilter(e.target.value as RadarStatus|"all")}
          disabled={!available} aria-label="Filtrar classificação"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm disabled:opacity-40">
          <option value="all">Todas as situações</option>
          {Object.entries(statusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      {!filtered.length?<p className="py-9 text-center text-sm text-slate-400">
        {available?"Nenhuma DNS encontrada com esses filtros.":"Os resultados aparecerão após a liberação do Radar."}
      </p>:<div className="space-y-2">{filtered.map(s=><div key={s.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70">
        <button type="button" onClick={()=>setExpanded(expanded===s.id?null:s.id)}
          aria-expanded={expanded===s.id} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-blue-500/5">
          <div className="min-w-0">
            <div className="font-semibold">{s.name}</div>
            <div className="max-w-full truncate text-xs text-slate-400">{s.host}</div>
          </div>
          <span className={"rounded-full border px-3 py-1 text-xs font-semibold "+statusColors[s.status]}>{statusLabels[s.status]}</span>
        </button>
        {expanded===s.id&&<div className="space-y-3 border-t border-slate-800 p-4 text-sm">
          <div><span className="text-slate-400">Identificado:</span> {date(s.identifiedAt)}</div>
          <div><span className="text-slate-400">Última checagem:</span> {date(s.lastCheckedAt)}</div>
          <div><span className="text-slate-400">Regiões verificadas:</span> {s.regions.join(", ")||"Não verificadas"}</div>
          <p className="text-slate-300">{s.technicalSummary}</p>
          <div className="space-y-1 border-t border-slate-800 pt-3">
            <h3 className="font-semibold">Histórico</h3>
            {!s.history.length?<p className="text-slate-400">Sem alterações registradas.</p>
              :s.history.map((h,i)=><p key={i} className="text-xs text-slate-300">{date(h.at)} · {statusLabels[h.status]} · {h.description}</p>)}
          </div>
        </div>}
      </div>)}</div>}
      <p className="mt-4 text-xs text-slate-500">
        Falha de conexão não significa bloqueio. Diagnósticos inconclusivos permanecem como não verificados.
      </p>
    </div>
  </section>;
}
