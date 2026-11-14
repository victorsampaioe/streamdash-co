import {createFileRoute, redirect} from "@tanstack/react-router";
import {useEffect,useState} from "react";
import {useQuery,useMutation,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {supabase} from "@/integrations/supabase/client";
import {
  getObservabilityAdmin, savePosthogSettings, saveGrafanaSettings, runGrafanaMetricsNow
} from "@/lib/observability.functions";
import {Card,CardContent,CardHeader,CardTitle,CardDescription} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {BarChart3,Cloud,ExternalLink,ShieldCheck,RefreshCw,Activity} from "lucide-react";
import {toast} from "sonner";

export const Route=createFileRoute("/_authenticated/app/admin_/observabilidade")({
  beforeLoad:async()=>{
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user)throw redirect({to:"/auth"});
    const {data,error}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
    if(error||data!==true)throw redirect({to:"/app"});
  },
  head:()=>({meta:[{title:"Observabilidade | Admin Stream Monitor"},
    {name:"robots",content:"noindex,nofollow"}]}),
  component:ObservabilidadePage,
});

function ObservabilidadePage(){
  const qc=useQueryClient();
  const get=useServerFn(getObservabilityAdmin);
  const savePosthog=useServerFn(savePosthogSettings);
  const saveGrafana=useServerFn(saveGrafanaSettings);
  const sendMetrics=useServerFn(runGrafanaMetricsNow);
  const query=useQuery({queryKey:["admin-observability"],queryFn:()=>get(),staleTime:30000});
  const [posthogKey,setPosthogKey]=useState("");
  const [posthogHost,setPosthogHost]=useState<"https://us.i.posthog.com"|"https://eu.i.posthog.com">("https://us.i.posthog.com");
  const [posthogEnabled,setPosthogEnabled]=useState(false);
  const [grafanaEndpoint,setGrafanaEndpoint]=useState("");
  const [grafanaStackId,setGrafanaStackId]=useState("");
  const [grafanaToken,setGrafanaToken]=useState("");
  const [grafanaEnabled,setGrafanaEnabled]=useState(false);

  useEffect(()=>{
    if(!query.data)return;
    setPosthogKey(query.data.posthog.projectKey);
    setPosthogHost(query.data.posthog.host as typeof posthogHost);
    setPosthogEnabled(query.data.posthog.enabled);
    setGrafanaEndpoint(query.data.grafana.endpoint);
    setGrafanaStackId(query.data.grafana.stackId);
    setGrafanaEnabled(query.data.grafana.enabled);
  },[query.data]);

  const savePH=useMutation({
    mutationFn:()=>savePosthog({data:{projectKey:posthogKey,host:posthogHost,enabled:posthogEnabled}}),
    onSuccess:async()=>{toast.success("Configuração PostHog salva.");await qc.invalidateQueries({queryKey:["admin-observability"]});},
    onError:(e:Error)=>toast.error(e.message)
  });
  const saveGF=useMutation({
    mutationFn:()=>saveGrafana({data:{
      endpoint:grafanaEndpoint,stackId:grafanaStackId,
      token:grafanaToken||undefined,enabled:grafanaEnabled
    }}),
    onSuccess:async()=>{setGrafanaToken("");toast.success("Configuração Grafana salva.");await qc.invalidateQueries({queryKey:["admin-observability"]});},
    onError:(e:Error)=>toast.error(e.message),
  });
  const testGF=useMutation({
    mutationFn:()=>sendMetrics(),
    onSuccess:async(result)=>{
      if(result.status==="sent")toast.success(`${result.metrics} métricas enviadas ao Grafana Cloud!`);
      else toast.error(result.status==="disabled"?"Ative o Grafana antes de testar.":`Envio não concluído: ${result.code??"verifique os dados"}`);
      await qc.invalidateQueries({queryKey:["admin-observability"]});
    },
    onError:(e:Error)=>toast.error(e.message),
  });

  return <div className="mx-auto max-w-6xl space-y-6 pb-16">
    <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-r from-[#0c1e39] to-[#080f1d] p-5 text-white sm:p-7">
      <Badge className="border-blue-400/25 bg-blue-500/10 text-blue-200">Admin • Integrações privadas</Badge>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-black sm:text-3xl">
        <Activity className="h-7 w-7 text-blue-400"/> Observabilidade Inteligente
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
        Configure PostHog para analisar aquisição e uso da plataforma e Grafana Cloud
        para acompanhar métricas da infraestrutura. Nenhuma integração externa
        fica ativa até você habilitar com suas credenciais.
      </p>
    </div>
    {query.isLoading&&<p className="text-muted-foreground">Carregando integrações…</p>}
    {query.isError&&<p role="alert" className="rounded-xl border border-red-500/30 p-4 text-red-400">
      Falha ao carregar a configuração. Confira o banco e sua permissão de administrador.
    </p>}
    {query.data&&<div className="grid gap-5 lg:grid-cols-2">
      <Card className="border-blue-500/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-blue-400"/> PostHog
            </CardTitle>
            <Badge variant={query.data.posthog.enabled?"default":"secondary"}>
              {query.data.posthog.enabled?"Ativo":"Não configurado"}
            </Badge>
          </div>
          <CardDescription>Visitas, início e conclusão de cadastros, logins e abertura das ferramentas. Sem gravação de telas e sem dados sensíveis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">Project API Key pública
            <Input autoComplete="off" placeholder="phc_..." value={posthogKey}
              onChange={e=>setPosthogKey(e.target.value)} />
          </label>
          <label className="block space-y-2 text-sm font-medium">Região do projeto
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={posthogHost} onChange={e=>setPosthogHost(e.target.value as typeof posthogHost)}>
              <option value="https://us.i.posthog.com">Estados Unidos (US)</option>
              <option value="https://eu.i.posthog.com">Europa (EU)</option>
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input type="checkbox" checked={posthogEnabled}
              onChange={e=>setPosthogEnabled(e.target.checked)} className="mt-1 h-4 w-4"/>
            <span>Ativar coleta anônima de eventos úteis, respeitando as preferências de privacidade do visitante.</span>
          </label>
          <p className="text-xs leading-5 text-muted-foreground">A chave do projeto PostHog é pública. Nenhuma senha ou chave privada da sua conta deve ser colocada aqui. Não usamos gravação de sessões, autocapture ou identificação por e-mail.</p>
          <Button className="w-full" disabled={savePH.isPending} onClick={()=>savePH.mutate()}>
            {savePH.isPending?"Salvando…":"Salvar PostHog"}
          </Button>
          <a href="https://app.posthog.com/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:underline">
            Abrir ou criar conta grátis PostHog <ExternalLink className="h-4 w-4"/>
          </a>
        </CardContent>
      </Card>

      <Card className="border-cyan-500/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Cloud className="h-5 w-5 text-cyan-400"/> Grafana Cloud
            </CardTitle>
            <Badge variant={query.data.grafana.enabled?"default":"secondary"}>
              {query.data.grafana.enabled?"Ativo":"Não configurado"}
            </Badge>
          </div>
          <CardDescription>10 métricas agregadas de servidores, alertas, pagamentos e incidentes via OpenTelemetry. Atualização a cada 15 minutos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2 text-sm font-medium">OTLP Endpoint da sua stack
            <Input autoComplete="off" value={grafanaEndpoint}
              onChange={e=>setGrafanaEndpoint(e.target.value)}
              placeholder="https://otlp-gateway-prod-...grafana.net/otlp"/>
          </label>
          <label className="block space-y-2 text-sm font-medium">Instance ID numérico
            <Input autoComplete="off" value={grafanaStackId}
              onChange={e=>setGrafanaStackId(e.target.value)} placeholder="Ex.: 1234567"/>
          </label>
          <label className="block space-y-2 text-sm font-medium">Access Policy Token (MetricsPublisher)
            <Input type="password" autoComplete="new-password" value={grafanaToken}
              onChange={e=>setGrafanaToken(e.target.value)}
              placeholder={query.data.grafana.hasToken?"Já armazenado no cofre (deixe vazio para manter)":"Cole o token de escrita aqui"}/>
          </label>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-blue-400"/>
            {query.data.grafana.hasToken?"Token protegido no cofre do servidor.":"Token ainda não cadastrado."}
          </p>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
            <input type="checkbox" checked={grafanaEnabled}
              onChange={e=>setGrafanaEnabled(e.target.checked)} className="mt-1 h-4 w-4"/>
            <span>Ativar o envio de métricas agregadas ao Grafana Cloud. Não enviar endereços DNS, nomes de clientes ou credenciais.</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Último envio: {query.data.grafana.lastExportAt?new Date(query.data.grafana.lastExportAt).toLocaleString("pt-BR"):"ainda não executado"} · Status: {query.data.grafana.lastExportStatus}.
          </p>
          <Button className="w-full" disabled={saveGF.isPending} onClick={()=>saveGF.mutate()}>
            {saveGF.isPending?"Salvando…":"Salvar Grafana Cloud"}
          </Button>
          <Button variant="outline" className="w-full" disabled={testGF.isPending||!query.data.grafana.enabled}
            onClick={()=>testGF.mutate()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${testGF.isPending?"animate-spin":""}`}/>
            {testGF.isPending?"Verificando…":"Testar envio de métricas"}
          </Button>
          <a href="https://grafana.com/products/cloud/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:underline">
            Abrir ou criar conta grátis Grafana Cloud <ExternalLink className="h-4 w-4"/>
          </a>
        </CardContent>
      </Card>
    </div>}
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm leading-6 text-muted-foreground">
      <strong className="text-foreground">Custos controlados:</strong> sem gravações de sessão,
      envio apenas de eventos necessários e dez séries estáveis de métricas, sem etiquetas por cliente.
      As franquias gratuitas são administradas nas plataformas externas; evite ativar planos
      pagos ou adicionais sem limite de gastos.
    </div>
  </div>;
}
