import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {getAdminAcquisitionReport} from "@/lib/acquisition-report.functions";
import {formatBRL} from "@/lib/payments";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";

const labels:Record<string,string>={
 meta_ads:"Anúncios Meta",other_campaign:"Outras campanhas",referral:"Indicações",
 organic:"Busca orgânica",direct:"Acesso direto",social_unverified:"Rede social sem prova de anúncio",
 unattributed:"Sem atribuição / sem consentimento",facebook:"Facebook",
 instagram:"Instagram",other:"Outros",unknown:"Plataforma desconhecida",
 unidentified:"Campanha não identificada"
};
function money(cents:number|null|undefined){
 return cents==null?"—":formatBRL(cents);
}
function label(x:string){return labels[x]||x;}
export function AcquisitionPanel(){
 const fn=useServerFn(getAdminAcquisitionReport);
 const {data,error,isLoading,refetch,isFetching}=useQuery({
  queryKey:["admin","client-acquisition-v1"],queryFn:()=>fn(),staleTime:60_000
 });
 if(isLoading)return <Card className="p-6 text-sm text-muted-foreground">Carregando aquisição...</Card>;
 if(error||!data)return <Card className="space-y-3 p-6">
   <p className="text-sm text-destructive">Não foi possível verificar aquisição e pagamentos.</p>
   <button onClick={()=>void refetch()} className="rounded-md border px-3 py-2 text-sm">Tentar novamente</button>
 </Card>;
 const {totals,bySource,byPlatform,byCampaign}=data;
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-xl font-bold">Aquisição de Clientes</h2>
    <p className="text-sm text-muted-foreground">Cadastros efetivos, assinaturas pagas e custo por cliente. Sem estimar conversões inexistentes.</p>
   </div>
   <button onClick={()=>void refetch()} disabled={isFetching}
    className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent">
    {isFetching?"Atualizando...":"Atualizar relatório"}
   </button>
  </div>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
   <Kpi title="Contas na plataforma" value={totals.profiles.toLocaleString("pt-BR")}/>
   <Kpi title="Cadastros com registro de origem" value={totals.newAttributed.toLocaleString("pt-BR")}/>
   <Kpi title="Assinantes pagantes (base atual)" value={totals.paidKnown.toLocaleString("pt-BR")}/>
   <Kpi title="Investimento importado" value={money(totals.spendCents)}/>
  </div>
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
   <Kpi title="Cliques no link (Meta)" value={totals.linkClicks.toLocaleString("pt-BR")}/>
   <Kpi title="Visualizações da página (Meta)" value={totals.landingPageViews.toLocaleString("pt-BR")}/>
   <Kpi title="Visitas ao cadastro (com consentimento)" value={totals.signupPageVisits.toLocaleString("pt-BR")}/>
   <Kpi title="Pagantes com origem registrada" value={totals.paidWithFirstTouch.toLocaleString("pt-BR")}/>
  </div>
  <Card>
   <CardHeader><CardTitle className="text-base">Origem dos novos clientes</CardTitle></CardHeader>
   <CardContent className="overflow-x-auto">
    <table className="w-full text-sm min-w-[690px]">
     <thead><tr className="text-left text-muted-foreground border-b">
      <th className="p-2">Origem</th><th className="p-2">Visitas ao cadastro</th><th className="p-2">Cadastros</th>
      <th className="p-2">Pagantes</th><th className="p-2">Receita paga</th>
      <th className="p-2">Gasto</th><th className="p-2">Custo por pagante</th>
     </tr></thead>
     <tbody>{bySource.map(x=><tr className="border-b border-border/50" key={x.key}>
      <td className="p-2 font-medium">{label(x.key)}</td>
      <td className="p-2 tabular-nums">{x.signupPageVisits??"—"}</td>
      <td className="p-2 tabular-nums">{x.registrations}</td>
      <td className="p-2 tabular-nums">{x.paidCustomers}</td>
      <td className="p-2 tabular-nums">{money(x.revenueCents)}</td>
      <td className="p-2 tabular-nums">{money(x.spendCents)}</td>
      <td className="p-2 tabular-nums font-semibold">{money(x.costPerPaidCustomerCents)}</td>
     </tr>)}</tbody>
    </table>
   </CardContent>
  </Card>
  <Card>
   <CardHeader><CardTitle className="text-base">Facebook x Instagram</CardTitle></CardHeader>
   <CardContent className="grid gap-3 sm:grid-cols-2">
    {byPlatform.filter(x=>x.key==="facebook"||x.key==="instagram").map(x=><div key={x.key} className="rounded-xl border p-4 space-y-2">
     <p className="font-bold">{label(x.key)}</p>
     <p className="text-sm">Gasto: <strong>{money(x.spendCents)}</strong></p>
     <p className="text-sm">Cliques: <strong>{x.linkClicks??"—"}</strong> · Destino: <strong>{x.landingPageViews??"—"}</strong></p>
     <p className="text-sm">Cadastros atribuídos: <strong>{x.registrations}</strong> · Pagantes: <strong>{x.paidCustomers}</strong> · Cadastro visitado: <strong>{x.signupPageVisits??"—"}</strong></p>
     <p className="text-sm">Custo por cliente pagante: <strong>{money(x.costPerPaidCustomerCents)}</strong></p>
    </div>)}
   </CardContent>
  </Card>
  <Card>
   <CardHeader><CardTitle className="text-base">Campanhas rastreadas</CardTitle></CardHeader>
   <CardContent className="space-y-2">
    {byCampaign.filter(x=>x.spendCents!==null||x.registrations>0).map(x=><div key={x.key} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
     <span className="min-w-0 break-words">{x.key}</span>
     <span className="shrink-0 text-right">Gasto {money(x.spendCents)} · {x.registrations} cadastros · {x.paidCustomers} pagantes</span>
    </div>)}
   </CardContent>
  </Card>
  <div className="rounded-xl border border-amber-500/20 p-4 text-xs text-muted-foreground space-y-2">
   <div className="flex items-center gap-2">
    <Badge variant="outline">Rastreamento parcial</Badge>
    <span>Pixel Meta: recebimento dos eventos ainda não certificado no Gerenciador de Eventos.</span>
   </div>
   <p>O relatório preserva {totals.historicalUnattributed} perfis sem origem anterior comprovada. Recusar cookies de publicidade não impede criar conta; essas visitas não devem ser inventadas como anúncios ou acesso direto.</p>
   <p>Custos da Meta são importações pontuais, não um fluxo de gastos em tempo real. Última consulta: {data.metaCostsLastImported?new Date(data.metaCostsLastImported).toLocaleString("pt-BR"):"não disponível"}.</p>
   <p>{data.note}</p>
  </div>
 </div>;
}
function Kpi({title,value}:{title:string;value:string}){
 return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{title}</p>
  <p className="mt-2 text-xl font-bold tabular-nums">{value}</p></CardContent></Card>;
}
