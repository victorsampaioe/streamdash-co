import {createFileRoute} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {runVisualAudit} from "@/lib/visual-audit.functions";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {toast} from "sonner";
import {ShieldCheck,Eye,Download,RefreshCw,Monitor,AlertTriangle} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/auditoria")({
  component:VisualAudit,
  head:()=>({meta:[{title:"Auditoria Visual | Stream Monitor"}]})
});
type RecordRow={id:string;label:string;target_url:string;status:string;http_status:number|null;duration_ms:number|null;screenshot_storage_path:string|null;checked_at:string|null};

function VisualAudit(){
  const run=useServerFn(runVisualAudit);
  const qc=useQueryClient();
  const [working,setWorking]=useState(false);
  const [lastMode,setLastMode]=useState("");
  const records=useQuery({queryKey:["visual-audit-history"],queryFn:async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw new Error("Entre na sua conta.");
    const {data:roles,error:roleErr}=await supabase.rpc("has_role",{_user_id:user.id,_role:"admin"});
    if(roleErr||roles!==true)throw new Error("Área exclusiva para administradores.");
    const {data,error}=await supabase.from("visual_audit_checks" as any)
      .select("id,label,target_url,status,http_status,duration_ms,screenshot_storage_path,checked_at")
      .eq("owner_id",user.id).order("checked_at",{ascending:false}).limit(75);
    if(error)throw error;
    return (data??[]) as RecordRow[];
  },staleTime:30000});
  async function execute(){
    setWorking(true);
    try{
      const result=await run();
      setLastMode(result.mode==="browser"?"Cloudflare Browser Rendering":"Verificação HTTP (sem captura)");
      await qc.invalidateQueries({queryKey:["visual-audit-history"]});
      toast.success(`${result.results.length} verificações registradas.`);
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
        <div className={`text-lg font-bold mt-2 ${item.status==="ok"?"text-emerald-400":item.status==="partial"?"text-amber-400":"text-red-400"}`}>
          {item.status==="ok"?"Verificado":item.status==="partial"?"Verificação parcial":"Falha"}
        </div>
        <p className="text-xs text-muted-foreground mt-2">{item.http_status??"Sem HTTP"} · {item.duration_ms??"-"} ms</p>
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
            <p className="font-semibold text-sm">{item.label} <span className={item.status==="ok"?"text-emerald-400":item.status==="partial"?"text-amber-400":"text-red-400"}>· {item.status}</span></p>
            <p className="text-xs text-muted-foreground break-all">{item.target_url}</p>
            <p className="text-xs text-muted-foreground">{item.checked_at?new Date(item.checked_at).toLocaleString("pt-BR"):"Não executado"} · HTTP {item.http_status??"-"} · {item.duration_ms??"-"} ms</p>
          </div>
          <Button size="sm" variant="outline" disabled={!item.screenshot_storage_path} onClick={()=>open(item.screenshot_storage_path)}>
            <Download size={15} className="mr-2"/>Captura
          </Button>
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground flex gap-2"><ShieldCheck size={15}/>Capturas são arquivos privados no Lovable Cloud, acessados por links temporários.</p>
    </Card>
  </div>;
}
