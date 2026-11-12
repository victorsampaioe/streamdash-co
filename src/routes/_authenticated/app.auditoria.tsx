import {createFileRoute} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {runVisualAudit,saveVisualAuditBrowserProbe} from "@/lib/visual-audit.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {toast} from "sonner";
import {ShieldCheck,Eye,Download,RefreshCw,Monitor,AlertTriangle} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/auditoria")({
  component:VisualAudit,
  head:()=>({meta:[{title:"Auditoria Visual | Stream Monitor"}]})
});
type RecordRow={id:string;label:string;target_url:string;status:string;http_status:number|null;duration_ms:number|null;screenshot_storage_path:string|null;checked_at:string|null;diagnostic:string|null;probe_mode:string|null};
const STATUS_LABEL:Record<string,string>={ok:"Verificado com captura",partial:"HTTP verificado (parcial)",failed:"Falha HTTP confirmada",unavailable:"Auditoria indisponível"};
const DIAGNOSTIC_LABEL:Record<string,string>={
  audit_network_unavailable:"O servidor de auditoria não conseguiu acessar o site. Isso não significa que ele esteja fora do ar.",
  audit_request_timeout:"A inspeção ultrapassou o tempo limite.",
  client_http_only_no_screenshot:"O navegador confirmou a resposta HTTP; não há captura visual nesta inspeção.",
  client_http_unexpected_content_or_status:"A página não retornou o conteúdo esperado.",
  browser_network_failure:"O navegador não conseguiu realizar a verificação.",
  browser_timeout:"Tempo limite da verificação no navegador.",
  browser_invalid_response:"O conteúdo recebido não corresponde ao esperado.",
  http_only_no_browser_capture:"Resposta HTTP confirmada, mas sem captura visual.",
  screenshot_storage_failed:"O navegador verificou a página, mas não foi possível armazenar a captura.",
  browser_render_response_invalid:"A ferramenta de captura retornou uma resposta inválida."
};
function explainDiagnostic(code:string|null){if(!code)return "";if(DIAGNOSTIC_LABEL[code])return DIAGNOSTIC_LABEL[code];if(code.startsWith("browser_render_http_"))return "Cloudflare Browser Rendering retornou um erro de integração.";if(code.startsWith("http_"))return "A inspeção recebeu uma resposta HTTP inesperada.";return "Verificação inconclusiva. Tente novamente.";}
async function browserProbe(url:string){
  if(typeof window==="undefined"||window.location.hostname!=="streammonitor.site")return null;
  const target=new URL(url);
  if(target.origin!==window.location.origin)return null;
  const start=performance.now();
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(target.pathname,{method:"GET",cache:"no-store",credentials:"same-origin",signal:controller.signal,headers:{Accept:target.pathname==="/api/public/health"?"application/json":"text/html"}});
    const body=await response.text();
    const hasExpectedContent=target.pathname==="/api/public/health"
      ?response.ok&&/"ok"\s*:\s*true/.test(body)
      :/<html\b/i.test(body)&&/<body\b/i.test(body);
    return {httpStatus:response.status,durationMs:Math.max(1,Math.round(performance.now()-start)),hasExpectedContent,errorCode:"none" as const};
  }catch(err){
    return {httpStatus:null,durationMs:Math.max(1,Math.round(performance.now()-start)),hasExpectedContent:false,errorCode:(err instanceof Error&&err.name==="AbortError"?"browser_timeout":"browser_network_failure") as "browser_timeout"|"browser_network_failure"};
  }finally{window.clearTimeout(timeout);}
}

function VisualAudit(){
  const run=useServerFn(runVisualAudit);
  const saveBrowserProbe=useServerFn(saveVisualAuditBrowserProbe);
  const qc=useQueryClient();
  const [working,setWorking]=useState(false);
  const [lastMode,setLastMode]=useState("");
  const records=useQuery({queryKey:["visual-audit-history"],queryFn:async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw new Error("Entre na sua conta.");
    const {data:roles,error:roleErr}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
    if(roleErr||roles!==true)throw new Error("Área exclusiva para administradores.");
    const {data,error}=await supabase.from("visual_audit_checks" as any)
      .select("id,label,target_url,status,http_status,duration_ms,screenshot_storage_path,checked_at,diagnostic,probe_mode")
      .eq("owner_id",user.id).order("checked_at",{ascending:false}).limit(75);
    if(error)throw error;
    return (data??[]) as RecordRow[];
  },staleTime:30000});
  async function execute(){
    setWorking(true);
    try{
      const result=await run();
      const unresolved=result.results.filter(item=>item.httpStatus===null&&item.mode==="http");
      let checkedInBrowser=0;
      for(const item of unresolved){
        const outcome=await browserProbe(item.url);
        if(!outcome)continue;
        try{
          const saved=await saveBrowserProbe({data:{checkId:item.checkId,...outcome}});
          if(saved.updated)checkedInBrowser++;
        }catch(err){console.error("[visual-audit] browser fallback",err);}
      }
      setLastMode(result.mode==="browser"?"Captura Cloudflare disponível":checkedInBrowser?
        "Verificação HTTP pelo navegador (sem captura)":"Inspeção do servidor: confira os diagnósticos");
      await qc.invalidateQueries({queryKey:["visual-audit-history"]});
      if(checkedInBrowser||result.results.some(x=>x.status==="ok"||x.status==="partial")){
        toast.success(`Auditoria concluída: ${result.results.length} destinos analisados.`);
      }else{
        toast.warning("A auditoria não conseguiu obter respostas. Veja os diagnósticos abaixo.");
      }
    }catch(e){toast.error(e instanceof Error?e.message:"Falha na auditoria");}
    finally{setWorking(false);}
  }
  async function open(path:string|null){
    if(!path)return;
    const {data,error}=await supabase.storage.from("stream-evidence").createSignedUrl(path,120);
    if(error||!data?.signedUrl)return toast.error("Captura indisponível.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  const recent=records.data?.slice(0,4)??[];
  return <div className="space-y-5 max-w-6xl">
    <Card className="p-6 border-blue-500/20 bg-gradient-to-br from-blue-600/10 to-transparent">
      <div className="text-xs uppercase tracking-wider text-blue-400 flex items-center gap-2"><Eye size={16}/> Sentinel Visual</div>
      <h1 className="text-3xl font-bold mt-2">Auditoria Visual Inteligente</h1>
      <p className="text-sm text-muted-foreground mt-2">Inspecione página inicial, login, saúde da API e Central pública. O modo Browser Rendering verifica HTML renderizado e salva uma captura quando a integração está configurada.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={execute} disabled={working||records.isError}><RefreshCw size={16} className="mr-2"/>{working?"Auditando...":"Executar auditoria agora"}</Button>
        {lastMode&&<span className="text-sm self-center text-muted-foreground">{lastMode}</span>}
      </div>
    </Card>
    {records.isError&&<Card className="p-5 text-destructive">{String(records.error)}</Card>}
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {recent.map(item=><Card key={item.id} className="p-4">
        <p className="font-semibold text-sm">{item.label}</p>
        <div className={`text-lg font-bold mt-2 ${item.status==="ok"?"text-emerald-400":item.status==="partial"?"text-amber-400":item.status==="unavailable"?"text-slate-400":"text-red-400"}`}>
          {STATUS_LABEL[item.status]??"Aguardando"}
        </div>
        <p className="text-xs text-muted-foreground mt-2">HTTP {item.http_status??"não obtido"} · {item.duration_ms??"-"} ms</p>
        {item.diagnostic&&<p className="text-[11px] text-muted-foreground mt-2">{explainDiagnostic(item.diagnostic)}</p>}
      </Card>)}
    </div>
    <Card className="p-5 space-y-4">
      <h2 className="font-bold flex items-center gap-2"><Monitor size={18}/> Histórico de inspeções</h2>
      <p className="text-xs text-muted-foreground flex items-start gap-2"><AlertTriangle size={16} className="shrink-0"/>Uma verificação HTTP parcial não comprova que todos os botões e formulários funcionam. Somente inspeções via navegador com captura podem indicar evidência visual.</p>
      {records.isLoading&&<p>Consultando auditorias...</p>}
      {records.data?.length===0&&<p className="text-sm text-muted-foreground">Nenhuma auditoria executada ainda.</p>}
      <div className="space-y-2">
        {records.data?.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3">
          <div className="min-w-0">
            <p className="font-semibold text-sm">{item.label} <span className={item.status==="ok"?"text-emerald-400":item.status==="partial"?"text-amber-400":item.status==="unavailable"?"text-slate-400":"text-red-400"}>· {STATUS_LABEL[item.status]??item.status}</span></p>
            <p className="text-xs text-muted-foreground break-all">{item.target_url}</p>
            <p className="text-xs text-muted-foreground">{item.checked_at?new Date(item.checked_at).toLocaleString("pt-BR"):"Não executado"} · HTTP {item.http_status??"não obtido"} · {item.duration_ms??"-"} ms · {item.probe_mode==="client_http"?"Navegador":item.probe_mode==="browser"?"Cloudflare":"Servidor"}</p>
            {item.diagnostic&&<p className="text-xs text-amber-200/80 mt-1">{explainDiagnostic(item.diagnostic)}</p>}
          </div>
          <Button size="sm" variant="outline" disabled={!item.screenshot_storage_path} onClick={()=>open(item.screenshot_storage_path)}>
            <Download size={15} className="mr-2"/>Captura
          </Button>
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground flex gap-2"><ShieldCheck size={15}/>Capturas, quando disponíveis via Cloudflare, ficam privadas no Lovable Cloud. A verificação HTTP pelo navegador é parcial e não gera captura.</p>
    </Card>
  </div>;
}
