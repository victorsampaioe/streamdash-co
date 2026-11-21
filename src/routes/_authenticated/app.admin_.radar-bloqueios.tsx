import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Info, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isAdminMaster } from "@/lib/permissions";
import { RadarBloqueiosDashboard, type RadarView } from "@/components/radar/radar-bloqueios-dashboard";

type AdminRadarPreview = RadarView & {
  overview: {
    mode: "admin_preview";
    scheduled: boolean;
    scanned: number;
    knownTargets: number;
    lastError: string|null;
    feedEnabled: boolean;
    notificationsEnabled: boolean;
    resellerAccessEnabled: boolean;
  };
};

export const Route = createFileRoute("/_authenticated/app/admin_/radar-bloqueios")({
  beforeLoad: async () => {
    const {data:{user},error} = await supabase.auth.getUser();
    if(error || !user) throw redirect({to:"/auth"});
    if(!isAdminMaster(user.email)){
      const result=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
      if(result.error || result.data !== true) throw redirect({to:"/app"});
    }
  },
  component: AdminRadarPreviewPage,
  head: () => ({
    meta: [
      {title:"Admin · Radar de Bloqueios | Stream Monitor"},
      {name:"robots",content:"noindex,nofollow,noarchive"},
    ],
  }),
});

const RADAR_ADMIN_API =
 "https://streammonitor-dns-history.victorsampaio133.workers.dev/v1/admin/radar";

function AdminRadarPreviewPage(){
  const result=useQuery<AdminRadarPreview>({
    queryKey:["admin-only-radar-bloqueios-preview"],
    queryFn:async()=>{
      const {data:{session},error}=await supabase.auth.getSession();
      const jwt=session?.access_token;
      const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if(error || !jwt || !key)throw new Error("Faça login novamente como administrador.");
      const res=await fetch(RADAR_ADMIN_API,{
        method:"GET",
        headers:{Authorization:"Bearer "+jwt,"x-sm-public-key":key,Accept:"application/json"},
        cache:"no-store",
        signal:AbortSignal.timeout(12000),
      });
      if(!res.ok){
        if(res.status===403)throw new Error("Acesso restrito aos administradores.");
        if(res.status===401)throw new Error("Sessão expirada. Entre novamente.");
        throw new Error("Radar temporariamente indisponível. Tente atualizar.");
      }
      const payload:unknown=await res.json();
      if(!payload || typeof payload!=="object" || !("verifiedOwnership" in payload) ||
        payload.verifiedOwnership!==true || !("servers" in payload) ||
        !Array.isArray(payload.servers))
        throw new Error("O servidor não confirmou acesso à prévia administrativa.");
      return payload as AdminRadarPreview;
    },
    staleTime:60_000,
    refetchInterval:90_000,
    refetchOnWindowFocus:false,
    retry:1,
  });
  const overview=result.data?.overview;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-blue-300">
        <ShieldAlert size={18}/> Prévia exclusiva do administrador
      </span>
      <span className="text-xs text-slate-400">Radar interno · sem avisos aos revendedores</span>
    </div>

    <RadarBloqueiosDashboard
      snapshot={result.data ?? null}
      loading={result.isFetching}
      onRefresh={()=>{void result.refetch();}}
    />

    {result.isLoading && <p className="text-sm text-muted-foreground">Carregando os registros da Cloudflare...</p>}
    {result.isError && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
      {result.error instanceof Error ? result.error.message : "Não foi possível consultar a prévia."}
      <button type="button" className="ml-3 inline-flex items-center gap-2 underline" onClick={()=>void result.refetch()}>
        <RefreshCw size={14}/>Tentar novamente
      </button>
    </div>}

    {overview && <section className="rounded-xl border border-blue-500/20 bg-slate-900/50 p-5 text-sm">
      <h2 className="mb-3 flex items-center gap-2 font-bold"><Info size={17} className="text-blue-400"/> Funcionamento do Radar (somente administrador)</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <p>DNS monitoradas: <strong>{overview.knownTargets}</strong></p>
        <p>DNS examinadas no último ciclo: <strong>{overview.scanned}</strong></p>
        <p>Rotina de análise: <strong>{overview.scheduled?"Já executada":"Aguardando primeira execução"}</strong></p>
        <p>Integração de inteligência: <strong>{overview.feedEnabled?"Habilitada":"Aguardando autorização"}</strong></p>
        <p>Notificações do Radar: <strong>{overview.notificationsEnabled?"Habilitadas":"Desativadas"}</strong></p>
        <p>Acesso de revendedores: <strong>{overview.resellerAccessEnabled?"Habilitado":"Bloqueado"}</strong></p>
      </div>
      {overview.lastError && <p className="mt-3 text-amber-400">
        Uma verificação apresentou inconsistência interna. Diagnósticos não confirmados continuam inconclusivos.
      </p>}
      <p className="mt-4 text-xs text-slate-400">
        Nesta prévia, uma DNS não verificada não é considerada normal nem bloqueada. 
        Nenhuma informação interna sobre fontes é compartilhada em áreas públicas.
      </p>
    </section>}
  </div>;
}
