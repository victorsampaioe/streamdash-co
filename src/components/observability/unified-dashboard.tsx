import {useMemo,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Card,CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {getUnifiedObservability,type PlatformDay} from "@/lib/unified-observability.functions";
import {
  Activity,ArrowDownRight,BarChart3,Bell,CheckCircle2,
  CircleAlert,Cloud,Database,Eye,Globe,RefreshCw,Server,Shield,Users,Wallet
} from "lucide-react";
import {
  ResponsiveContainer,AreaChart,Area,BarChart,Bar,
  CartesianGrid,XAxis,YAxis,Tooltip,Legend
} from "recharts";

const number=(v:number)=>new Intl.NumberFormat("pt-BR").format(v);
const money=(v:number)=>new Intl.NumberFormat("pt-BR",{
  style:"currency",currency:"BRL",minimumFractionDigits:2,
}).format(v/100);
const asDate=(date:string)=>date.length>=10?date.slice(8,10)+"/"+date.slice(5,7):date;
const featureNames:Record<string,string>={
 dashboard:"Painel",servidores:"Servidores",detalhe_servidor:"Detalhes do servidor",
 novo_servidor:"Novo servidor",alertas:"Alertas",radar:"Radar",
 radar_falhas:"Radar de falhas",assinatura:"Assinatura",
 vitrine_ia:"Vitrine IA",vitrine_banner:"Vitrine Banner",
 cadastro_login:"Cadastro/login",home:"Página inicial",
};
function Stat({label,value,hint,icon:Icon,color="blue"}:{
 label:string;value:string|number;hint?:string;
 icon:typeof Activity;color?:"blue"|"cyan"|"emerald"|"amber"|"red";
}){
 const colors={
   blue:"bg-blue-500/10 text-blue-400",cyan:"bg-cyan-500/10 text-cyan-400",
   emerald:"bg-emerald-500/10 text-emerald-400",amber:"bg-amber-500/10 text-amber-400",
   red:"bg-red-500/10 text-red-400",
 };
 return <Card className="min-w-0 border-border/70 bg-card/70">
  <CardContent className="p-4">
   <div className="flex items-center justify-between gap-2">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${colors[color]}`}>
      <Icon className="h-4 w-4" />
    </span>
   </div>
   <div className="mt-1 truncate text-2xl font-bold tracking-tight">{value}</div>
   {hint&&<p className="mt-1 text-[11px] leading-4 text-muted-foreground">{hint}</p>}
  </CardContent>
 </Card>;
}
const tooltipStyle={
 backgroundColor:"#071629",border:"1px solid #294467",borderRadius:12,color:"#f1f5f9",
};
export function UnifiedObservabilityDashboard(){
 const [days,setDays]=useState<7|14|30>(14);
 const get=useServerFn(getUnifiedObservability);
 const query=useQuery({
   queryKey:["unified-observability",days],
   queryFn:()=>get({data:{days}}),
   refetchInterval:60000,staleTime:15000,retry:1,
 });
 const data=query.data;
 const totals=useMemo(()=>{
  const daily=data?.daily??[];
  return daily.reduce((s:Record<string,number>,d:PlatformDay)=>({
   pageviews:s.pageviews+d.pageviews,visitors:s.visitors+d.visitors,
   registration:s.registration+d.registrations,
   sales:s.sales+d.paidOrders,revenue:s.revenue+d.revenueCents,
   toolOpens:s.toolOpens+d.featureOpens,
  }),{pageviews:0,visitors:0,registration:0,sales:0,revenue:0,toolOpens:0});
 },[data?.daily]);
 const history=data?.health??[];
 const historySample=history.filter((_,i)=>i%Math.max(1,Math.floor(history.length/72))===0);
 const labels=(data?.daily??[]).map(row=>({...row,label:asDate(row.day)}));
 return <section className="space-y-5" aria-labelledby="sm-obs-title">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <div className="flex flex-wrap items-center gap-2">
     <h2 id="sm-obs-title" className="text-xl font-black tracking-tight sm:text-2xl">
      Centro de Inteligência do Stream Monitor
     </h2>
     <Badge variant="outline" className="border-blue-400/30 text-blue-300">Dados nativos</Badge>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">
     Acompanhe o crescimento e a infraestrutura sem sair do seu painel.
    </p>
   </div>
   <div className="flex items-center gap-2">
    {([7,14,30] as const).map(n=>
     <Button key={n} size="sm" variant={days===n?"default":"outline"}
      aria-pressed={days===n} onClick={()=>setDays(n)}>{n} dias</Button>
    )}
    <Button size="icon" variant="outline" onClick={()=>void query.refetch()}
     disabled={query.isFetching} aria-label="Atualizar métricas">
      <RefreshCw className={`h-4 w-4 ${query.isFetching?"animate-spin":""}`}/>
    </Button>
   </div>
  </div>
  {query.isLoading&&<div className="rounded-xl border p-5 text-sm text-muted-foreground">
   Consultando dados da plataforma…
  </div>}
  {query.isError&&<div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
   Não foi possível carregar os indicadores agora. Confira a publicação e tente atualizar.
  </div>}
  {data&&<>
   <div className="flex flex-wrap gap-2">
    <Badge variant="outline" className="gap-1.5 border-blue-500/30">
     <Database className="h-3.5 w-3.5"/> Stream Monitor: conectado
    </Badge>
    <Badge variant="outline" className="gap-1.5">
     <BarChart3 className="h-3.5 w-3.5"/>
     PostHog: {data.integrations.posthogEnabled?"coletando em paralelo":"desativado"}
    </Badge>
    <Badge variant="outline" className="gap-1.5">
     <Cloud className="h-3.5 w-3.5"/>
     Grafana Cloud: {data.integrations.grafanaEnabled
      ?data.integrations.grafanaLastExportStatus==="sent"?"sincronizado":"configurado (verificar envio)"
      :"ainda não conectado"}
    </Badge>
   </div>

   <div className="space-y-2">
    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
     Operação — leitura atual
    </h3>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
     <Stat label="Servidores monitorados" value={number(data.live.total)} icon={Server}
       hint="Total cadastrado na plataforma"/>
     <Stat label="Funcionando (up)" value={number(data.live.online)} icon={CheckCircle2}
       color="emerald" hint="Estado técnico atual"/>
     <Stat label="Degradados" value={number(data.live.degraded)} icon={CircleAlert}
       color="amber" hint="Precisam de atenção; não é queda confirmada"/>
     <Stat label="Indisponíveis (down)" value={number(data.live.offline)} icon={ArrowDownRight}
       color="red" hint="Estado técnico de indisponibilidade"/>
     <Stat label="DNS sem resolução" value={number(data.live.dnsUnresolved)} icon={Globe}
       color="amber" hint="Não significa necessariamente IPTV offline"/>
     <Stat label="Incidentes em aberto" value={number(data.live.incidentsOpen)} icon={Shield}
       color="red" hint="Incidentes ainda não encerrados"/>
     <Stat label="Telegram aguardando" value={number(data.live.telegramPending)} icon={Bell}
       hint={`${number(data.live.telegramFailures24h)} falhas de entrega nas últimas 24h`}/>
     <Stat label="Assinaturas ativas" value={number(data.live.activeSubscriptions)}
       icon={Users} color="cyan" hint="Assinaturas com validade atual"/>
    </div>
   </div>

   <div className="space-y-2">
    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
     Crescimento e comportamento — período selecionado
    </h3>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
     <Stat label="Sessões que visitaram" value={number(totals.visitors)} icon={Eye}
       hint="Sessões consentidas, não pessoas únicas"/>
     <Stat label="Visualizações" value={number(totals.pageviews)} icon={BarChart3}
       hint="Páginas públicas medidas"/>
     <Stat label="Novos cadastros" value={number(totals.registration)} icon={Users}
       color="cyan" hint="Contas reais no banco"/>
     <Stat label="Pagamentos aprovados" value={number(totals.sales)} icon={CheckCircle2}
       color="emerald" hint="Pedidos aprovados, não apenas cliques"/>
     <Stat label="Recebimento registrado" value={money(totals.revenue)} icon={Wallet}
       color="emerald" hint="Pagamentos aprovados no período"/>
    </div>
   </div>

   <div className="grid gap-4 xl:grid-cols-2">
    <Card className="border-border/70">
     <CardContent className="p-4 sm:p-5">
      <h3 className="font-semibold">Visitas e cadastros</h3>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">
       Visitas consentidas desde a ativação desta coleta; cadastros incluem histórico do banco.
      </p>
      <div className="h-[235px]">
       <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={labels} margin={{top:5,right:4,left:-22,bottom:0}}>
         <CartesianGrid stroke="#334155" strokeDasharray="3 6" opacity={0.24}/>
         <XAxis dataKey="label" tick={{fontSize:10}} stroke="#718096"/>
         <YAxis allowDecimals={false} tick={{fontSize:10}} stroke="#718096"/>
         <Tooltip contentStyle={tooltipStyle}/>
         <Legend wrapperStyle={{fontSize:11}}/>
         <Area type="monotone" dataKey="pageviews" name="Visualizações" stroke="#60a5fa" fill="#3b82f6" fillOpacity={0.15}/>
         <Area type="monotone" dataKey="registrations" name="Cadastros reais" stroke="#34d399" fill="#34d399" fillOpacity={0.08}/>
        </AreaChart>
       </ResponsiveContainer>
      </div>
     </CardContent>
    </Card>
    <Card className="border-border/70">
     <CardContent className="p-4 sm:p-5">
      <h3 className="font-semibold">Pagamentos confirmados</h3>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">
       Valores e pedidos aprovados no Mercado Pago / banco da plataforma.
      </p>
      <div className="h-[235px]">
       <ResponsiveContainer width="100%" height="100%">
        <BarChart data={labels} margin={{top:5,right:4,left:-22,bottom:0}}>
         <CartesianGrid stroke="#334155" strokeDasharray="3 6" opacity={0.24}/>
         <XAxis dataKey="label" tick={{fontSize:10}} stroke="#718096"/>
         <YAxis allowDecimals={false} tick={{fontSize:10}} stroke="#718096"/>
         <Tooltip contentStyle={tooltipStyle}/>
         <Bar dataKey="paidOrders" name="Pedidos aprovados" fill="#22d3ee" radius={[3,3,0,0]}/>
        </BarChart>
       </ResponsiveContainer>
      </div>
     </CardContent>
    </Card>
    <Card className="border-border/70">
     <CardContent className="p-4 sm:p-5">
      <h3 className="font-semibold">Saúde da infraestrutura</h3>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">
       Histórico amostrado a cada 15 minutos; up, degraded e down.
      </p>
      <div className="h-[235px]">
       <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={historySample.map(h=>({...h,label:new Date(h.time).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" "+new Date(h.time).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}))}
          margin={{top:5,right:5,left:-18,bottom:0}}>
         <CartesianGrid stroke="#334155" strokeDasharray="3 6" opacity={0.24}/>
         <XAxis dataKey="label" tick={{fontSize:10}} stroke="#718096" minTickGap={18}/>
         <YAxis allowDecimals={false} tick={{fontSize:10}} stroke="#718096"/>
         <Tooltip contentStyle={tooltipStyle}/>
         <Legend wrapperStyle={{fontSize:11}}/>
         <Area dataKey="online" name="Up" type="monotone" stroke="#34d399" fill="#34d399" fillOpacity={0.08}/>
         <Area dataKey="degraded" name="Degradados" type="monotone" stroke="#fbbf24" fill="#fbbf24" fillOpacity={0.07}/>
         <Area dataKey="offline" name="Down" type="monotone" stroke="#f87171" fill="#f87171" fillOpacity={0.08}/>
        </AreaChart>
       </ResponsiveContainer>
      </div>
     </CardContent>
    </Card>
    <Card className="border-border/70">
     <CardContent className="p-4 sm:p-5">
      <h3 className="font-semibold">Ferramentas mais acessadas</h3>
      <p className="mt-1 mb-4 text-xs text-muted-foreground">
       Aberturas anônimas e consentidas registradas a partir da nova coleta.
      </p>
      {data.features.length>0?<div className="h-[235px]">
       <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data.features.map(row=>({
         ...row,label:featureNames[row.screen]??row.screen
        }))} margin={{top:4,right:10,left:14,bottom:0}}>
         <CartesianGrid stroke="#334155" strokeDasharray="3 6" opacity={0.2}/>
         <XAxis type="number" allowDecimals={false} tick={{fontSize:10}} stroke="#718096"/>
         <YAxis type="category" dataKey="label" width={110} tick={{fontSize:10}} stroke="#718096"/>
         <Tooltip contentStyle={tooltipStyle}/>
         <Bar dataKey="opens" name="Aberturas" fill="#818cf8" radius={[0,4,4,0]}/>
        </BarChart>
       </ResponsiveContainer>
      </div>:<div className="flex h-[235px] items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
       Os primeiros acessos aparecerão aqui após a coleta consentida começar.
      </div>}
     </CardContent>
    </Card>
   </div>
   <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4 text-xs leading-5 text-muted-foreground">
    <strong className="text-foreground">Origem e limites dos dados:</strong>
    indicadores operacionais e financeiros vêm do banco do Stream Monitor.
    O rastreamento de visitas inicia somente com a publicação da nova coleta
    e depende de consentimento; não recupera visitas antigas do PostHog.
    As métricas do Grafana Cloud são exportadas quando a integração estiver ativada;
    o painel acima não representa uma consulta histórica à API do Grafana.
    {data.trackingStarted&&<>
      {" "}Primeiro evento nativo em {new Date(data.trackingStarted).toLocaleString("pt-BR")}.
    </>}
   </div>
  </>}
 </section>;
}
