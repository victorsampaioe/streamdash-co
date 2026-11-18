import {createFileRoute} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useQuery} from "@tanstack/react-query";
import {useRef,useState} from "react";
import {Film,Search,Server,Clapperboard,ShieldCheck,Clock3,Database,CheckCircle2,AlertCircle,Send,RefreshCcw} from "lucide-react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {listMyCatalogServers,searchMyServerCatalog,loadMySeriesDetails} from "@/lib/server-catalog-search.functions";
import type {CatalogMediaKind,CatalogSearchResult} from "@/lib/server-catalog-search.server";
import type {SeriesDetailsResult} from "@/lib/series-episodes.server";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/conteudo-servidor")({
 component:ContentSearchPage,
 head:()=>({meta:[{title:"Conteúdo do Servidor | Stream Monitor"}]})
});
const types=[
 {value:"all",title:"Tudo"},{value:"vod",title:"Filmes"},
 {value:"series",title:"Séries"},{value:"live",title:"Canais"}
] as const;
const names:Record<string,string>={vod:"Filme",series:"Série",live:"Canal"};
const showDate=(date:string)=>new Date(date).toLocaleString("pt-BR",{timeZone:"America/Fortaleza",dateStyle:"short",timeStyle:"short"});
function ContentSearchPage(){
 const getServers=useServerFn(listMyCatalogServers);
 const searchCatalog=useServerFn(searchMyServerCatalog);
 const loadSeries=useServerFn(loadMySeriesDetails);
 const {data:servers=[],isLoading,error,refetch}=useQuery({
  queryKey:["my-eligible-catalog-servers"],queryFn:()=>getServers(),staleTime:120000
 });
 const [serverId,setServerId]=useState("");
 const [title,setTitle]=useState("");
 const [kind,setKind]=useState<CatalogMediaKind>("all");
 const [result,setResult]=useState<CatalogSearchResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [allowSearch,setAllowSearch]=useState(false);
 const [seriesData,setSeriesData]=useState<SeriesDetailsResult|null>(null);
 const [seriesBusy,setSeriesBusy]=useState<number|null>(null);
 const [seriesError,setSeriesError]=useState("");
 const seriesRequest=useRef(0);
 const clearSeries=()=>{seriesRequest.current++;setSeriesData(null);setSeriesError("");setSeriesBusy(null);};
 const selected=servers.find(s=>s.id===serverId);
 const search=async()=>{
  if(!selected){toast.error("Selecione um servidor reconhecido.");return;}
  if(!allowSearch){toast.error("Autorize a consulta deste servidor antes de pesquisar.");return;}
  if(title.trim().length<2){toast.error("Digite o nome do conteúdo.");return;}
  setBusy(true);setResult(null);clearSeries();
  try{
   const r=await searchCatalog({data:{serverId:selected.id,query:title,kind,authorized:true}});
   setResult(r);
  }catch(e){toast.error(e instanceof Error?e.message:"Pesquisa indisponível.");}
  finally{setBusy(false);}
 };
 const openSeries=async(itemId:number)=>{
  if(!selected||!allowSearch||!result?.items.some(i=>i.id===itemId&&i.kind==="series"))return;
  clearSeries();const requestId=seriesRequest.current;setSeriesBusy(itemId);
  try{
   const details=await loadSeries({data:{serverId:selected.id,itemId,authorized:true}});
   if(requestId===seriesRequest.current)setSeriesData(details);
  }catch(e){
   const message=e instanceof Error?e.message:"Não foi possível carregar os episódios desta série.";
   if(requestId===seriesRequest.current){setSeriesError(message);toast.error(message);}
  }finally{if(requestId===seriesRequest.current)setSeriesBusy(null);}
 };
 return <div className="mx-auto max-w-6xl space-y-6 pb-10">
  <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-[#12376b] via-[#101e3e] to-[#111128] p-5 text-white sm:p-8">
   <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-500/15 blur-3xl"/>
   <div className="relative z-10 max-w-2xl space-y-4">
    <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/25 bg-white/5 px-3 py-1.5 text-xs font-extrabold uppercase tracking-widest text-blue-200">
     <Database size={15}/> Inteligência de catálogo
    </div>
    <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Conteúdo do Servidor</h1>
    <p className="text-sm leading-7 text-blue-100 sm:text-base">
     Escolha seu servidor e consulte filmes, séries ou canais somente quando quiser.
     A pesquisa usa o catálogo salvo; temporadas e episódios são consultados individualmente somente se você solicitar.
    </p>
    <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
     <span className="rounded-lg border border-blue-300/25 bg-white/5 px-3 py-1.5">🔒 Apenas seus servidores</span>
     <span className="rounded-lg border border-blue-300/25 bg-white/5 px-3 py-1.5">✓ Catálogo reconhecido</span>
     <span className="rounded-lg border border-blue-300/25 bg-white/5 px-3 py-1.5">⚡ Busca só quando você pedir</span>
    </div>
   </div>
  </section>
  <div className="grid gap-5 lg:grid-cols-[1.5fr_.85fr]">
   <Card className="space-y-5 rounded-2xl border-blue-500/15 bg-card p-4 sm:p-6">
    <div className="flex items-center gap-2"><Search size={20} className="text-blue-400"/><h2 className="text-lg font-extrabold">Pesquisar catálogo</h2></div>
    <div className="space-y-2">
     <label htmlFor="catalog-server" className="text-xs font-semibold text-muted-foreground">1. Escolha um dos seus servidores</label>
     <select id="catalog-server" value={serverId} onChange={e=>{setServerId(e.target.value);setAllowSearch(false);setResult(null);clearSeries();}}
      className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm">
      <option value="">Selecionar servidor</option>
      {servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
     {isLoading&&<p className="text-xs text-muted-foreground">Conferindo servidores autorizados…</p>}
     {error&&<Button variant="outline" size="sm" onClick={()=>void refetch()}>Tentar novamente</Button>}
     {!isLoading&&!error&&!servers.length&&<p className="rounded-xl bg-amber-500/5 p-3 text-xs leading-6 text-amber-500">
      Nenhum servidor elegível no momento. É necessário ter créditos ou plano ativo, credenciais Xtream cadastradas,
      reconhecimento aprovado e ao menos uma sincronização do catálogo.
     </p>}
     {selected&&<p className="text-xs text-muted-foreground"><Clock3 size={13} className="mr-1 inline"/>Última leitura do catálogo: {showDate(selected.catalogSyncedAt)}</p>}
    </div>
    <div className="space-y-2">
     <p className="text-xs font-semibold text-muted-foreground">2. Tipo de conteúdo</p>
     <div className="flex flex-wrap gap-2">
      {types.map(t=><Button key={t.value} size="sm" variant={kind===t.value?"default":"outline"} onClick={()=>{setKind(t.value);setResult(null);clearSeries();}}>{t.title}</Button>)}
     </div>
    </div>
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5">
     <label className="flex cursor-pointer items-start gap-3 text-xs leading-6" htmlFor="catalog-opt-in">
      <input id="catalog-opt-in" type="checkbox" checked={allowSearch} disabled={!selected}
       onChange={e=>{setAllowSearch(e.target.checked);setResult(null);clearSeries();}}
       className="mt-1.5 h-4 w-4 shrink-0 accent-blue-500 disabled:opacity-50"/>
      <span><strong>Autorizo pesquisar o catálogo deste servidor quando eu clicar em Pesquisar.</strong>
       <span className="mt-1 block text-muted-foreground">Nada é pesquisado antes da sua confirmação. A pesquisa retorna somente títulos encontrados no catálogo previamente reconhecido. Não faz login novo no provedor nem uma sincronização completa.</span>
      </span>
     </label>
    </div>
    <form onSubmit={e=>{e.preventDefault();void search();}} className="space-y-2">
     <label htmlFor="catalog-title" className="text-xs font-semibold text-muted-foreground">3. Digite o nome do conteúdo</label>
     <div className="flex flex-col gap-2 sm:flex-row">
      <Input id="catalog-title" maxLength={120} placeholder="Ex.: Oppenheimer, Stranger Things, Globo…" value={title}
       onChange={e=>{setTitle(e.target.value);setResult(null);clearSeries();}} className="h-12 flex-1"/>
      <Button type="submit" disabled={busy||!serverId||!allowSearch||title.trim().length<2} className="h-12 gap-2 px-6"><Search size={17}/>{busy?"Pesquisando…":"Pesquisar"}</Button>
     </div>
    </form>
   </Card>
   <Card className="flex flex-col justify-between gap-5 rounded-2xl border-blue-500/15 bg-gradient-to-b from-card to-blue-950/5 p-5">
    <div className="space-y-4">
     <div className="flex items-center gap-2"><ShieldCheck className="text-blue-400"/><h2 className="font-bold">Pesquisa segura</h2></div>
     <div className="space-y-3 text-xs leading-6 text-muted-foreground">
      <p>Somente servidores cadastrados na sua conta e aprovados pelo monitoramento aparecem aqui.</p>
      <p>Credenciais continuam criptografadas e não são transmitidas ao navegador ou Telegram.</p>
      <p>Escolher o servidor não inicia a busca. O sistema pesquisa apenas quando você autorizar e clicar em Pesquisar.</p>
      <p>A pesquisa de títulos usa o último catálogo reconhecido. Apenas o botão “Ver temporadas e episódios” consulta uma única série diretamente no provedor, quando autorizado.</p>
     </div>
    </div>
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
     <p className="flex items-center gap-2 text-sm font-bold"><Send size={16} className="text-blue-400"/> Pesquise também pelo Telegram</p>
     <p className="mt-2 text-xs leading-6 text-muted-foreground">Abra seu bot vinculado e envie <strong>/conteudo Nome do Filme</strong>. Escolha seu servidor e consulte na hora.</p>
     <a href="https://t.me/MonitordeFluxoBot" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-xs font-bold text-blue-400 hover:underline">Abrir bot do Stream Monitor</a>
    </div>
   </Card>
  </div>
  {result&&<Card className="space-y-4 rounded-2xl border-blue-500/20 p-5 sm:p-7" aria-live="polite">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><p className="text-xs font-bold uppercase tracking-wider text-blue-400">Resultado da pesquisa</p>
     <h2 className="mt-1 text-xl font-extrabold">{result.query}</h2>
     <p className="mt-1 text-xs text-muted-foreground">Servidor: {result.server.name}</p></div>
    <span className={"inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold "+(result.status==="found"?"border-emerald-500/25 bg-emerald-500/10 text-emerald-400":"border-amber-500/25 bg-amber-500/10 text-amber-400")}>
     {result.status==="found"?<><CheckCircle2 size={15}/> Encontrado no catálogo</>:<><AlertCircle size={15}/> Não localizado no último catálogo</>}
    </span>
   </div>
   {result.stale&&<p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-400">Última sincronização há mais de 24 horas. Confirme pelo monitoramento se o catálogo precisa ser atualizado.</p>}
   {result.items.length>0&&<div className="grid gap-2 sm:grid-cols-2">
    {result.items.map(it=><div key={it.id} className="flex min-w-0 gap-3 rounded-xl border border-border/70 bg-background/40 p-3">
     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
      {it.kind==="vod"?<Film size={20}/>:it.kind==="series"?<Clapperboard size={20}/>:<Server size={20}/>}
     </span>
     <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold">{it.name}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{names[it.kind]}{it.category?" · "+it.category:""}</p>
      {it.kind==="series"&&<Button type="button" size="sm" variant="outline" className="mt-2 h-auto min-h-9 whitespace-normal text-left text-xs"
       disabled={seriesBusy!==null||!allowSearch} onClick={()=>void openSeries(it.id)}>
       <Clapperboard size={14} className="mr-1.5 shrink-0"/>{seriesBusy===it.id?"Consultando episódios…":"Ver temporadas e episódios"}
      </Button>}
     </div>
    </div>)}
   </div>}
   {result.limited&&<p className="text-xs text-muted-foreground">Mostrando os primeiros 15 títulos correspondentes. Refine o nome para encontrar um resultado específico.</p>}
   {seriesError&&<p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-400">{seriesError}</p>}
   {seriesData&&<section className="space-y-3 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <div><h3 className="flex items-center gap-2 font-extrabold"><Clapperboard size={18} className="text-blue-400"/>Temporadas e episódios</h3>
      <p className="mt-1 text-sm font-semibold">{seriesData.series.name}</p></div>
     {seriesData.cached&&<span className="text-xs text-muted-foreground">Consulta recente reutilizada</span>}
    </div>
    <p className="text-xs text-muted-foreground">
     {seriesData.seasons.length} temporada(s) informada(s) · {seriesData.episodeCount} episódio(s) listados pelo provedor
    </p>
    {!seriesData.provided&&<p className="text-sm text-amber-400">Este servidor não disponibilizou temporadas ou episódios para esta série.</p>}
    {seriesData.provided&&!seriesData.seasons.length&&<p className="text-sm text-muted-foreground">Nenhuma temporada informada pelo provedor.</p>}
    <div className="space-y-2">
     {seriesData.seasons.map(s=><details key={s.number} className="rounded-lg border border-border/70 bg-background/70 p-3">
      <summary className="cursor-pointer select-none text-sm font-bold">
       {s.number===0?"Especiais":"Temporada "+s.number} · {s.episodes.length} episódio(s) informados
      </summary>
      {s.episodes.length?<ol className="mt-3 space-y-1.5">
       {s.episodes.map((e,i)=><li key={i} className="rounded-md bg-blue-500/5 px-3 py-2 text-xs leading-5">
        <span className="font-bold">{e.number!==null?"Episódio "+e.number:"Episódio sem número"}</span>
        {e.name&&<span className="ml-2 text-muted-foreground">— {e.name}</span>}
       </li>)}
      </ol>:<p className="mt-2 text-xs text-muted-foreground">Esta temporada foi informada, mas a lista de episódios não foi disponibilizada.</p>}
     </details>)}
    </div>
    {seriesData.limited&&<p className="text-xs text-amber-400">A lista excedeu o limite de exibição segura. Alguns episódios podem não aparecer.</p>}
    <p className="text-xs text-muted-foreground">Leitura pontual de metadados pela API do provedor. Não é uma verificação de reprodução e não salva links de vídeo.</p>
   </section>}
   <p className="text-xs text-muted-foreground">Fonte: catálogo reconhecido em {showDate(result.server.catalogSyncedAt)}. Não é uma garantia de reprodução em tempo real.</p>
  </Card>}
 </div>;
}
