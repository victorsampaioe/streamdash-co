import {createFileRoute} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {toast} from "sonner";
import {FileText,Download,Trash2,UploadCloud,ShieldCheck} from "lucide-react";

export const Route=createFileRoute("/_authenticated/app/evidencias")({
  component:EvidenceLibrary,head:()=>({meta:[{title:"Biblioteca de Evidências | Stream Monitor"}]})
});
type Incident={id:string;server_id:string;reason:string|null;incident_type:string|null;started_at:string;ended_at:string|null};
type Evidence={id:string;title:string;content_type:string;storage_path:string|null;created_at:string;incident_id:string|null};

function pdfDocument(lines:string[]):Blob{
  const safe=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\x20-\x7E]/g,"?").replace(/[\\()]/g,ch=>"\\"+ch).slice(0,160);
  const commands=lines.slice(0,35).map((line,index)=>
    `BT /F1 11 Tf 45 ${790-index*20} Td (${safe(line)}) Tj ET`).join("\n");
  const objs=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`
  ];
  let data="%PDF-1.4\n";const positions=[0];
  objs.forEach((object,i)=>{positions.push(data.length);data+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const xref=data.length;
  data+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  positions.slice(1).forEach(p=>{data+=`${String(p).padStart(10,"0")} 00000 n \n`;});
  data+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([data],{type:"application/pdf"});
}
function EvidenceLibrary(){
  const qc=useQueryClient();
  const [server,setServer]=useState("");
  const [incident,setIncident]=useState("");
  const [title,setTitle]=useState("Relatório técnico");
  const [busy,setBusy]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const q=useQuery({queryKey:["evidence-library"],queryFn:async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw new Error("Entre na sua conta.");
    const [ss,docs]=await Promise.all([
      supabase.from("servers").select("id,name").eq("owner_id",user.id).order("name").limit(1000),
      supabase.from("evidence_documents").select("id,title,content_type,storage_path,created_at,incident_id")
        .eq("owner_id",user.id).order("created_at",{ascending:false}).limit(100)
    ]);
    if(ss.error)throw ss.error;if(docs.error)throw docs.error;
    return {owner:user.id,servers:ss.data??[],docs:docs.data??[]};
  },staleTime:30000});
  const incidents=useQuery({queryKey:["evidence-incidents",server],enabled:!!server,queryFn:async()=>{
    const {data,error}=await supabase.from("incidents")
      .select("id,server_id,reason,incident_type,started_at,ended_at").eq("server_id",server)
      .order("started_at",{ascending:false}).limit(100);
    if(error)throw error;return (data??[]) as Incident[];
  }});
  async function save(blob:Blob,name:string,mime:string){
    if(!q.data)throw new Error("Sessão indisponível.");
    const extension=mime==="application/pdf"?"pdf":mime==="image/png"?"png":mime==="text/csv"?"csv":"json";
    const path=`${q.data.owner}/${crypto.randomUUID()}.${extension}`;
    const {error:upError}=await supabase.storage.from("stream-evidence")
      .upload(path,blob,{contentType:mime,upsert:false});
    if(upError)throw upError;
    const {error}=await supabase.from("evidence_documents" as any).insert({
      owner_id:q.data.owner,server_id:server||null,incident_id:incident||null,
      title:name.slice(0,150),content_type:mime,storage_provider:"lovable_cloud",storage_path:path
    });
    if(error){
      await supabase.storage.from("stream-evidence").remove([path]);
      throw error;
    }
    await qc.invalidateQueries({queryKey:["evidence-library"]});
  }
  async function generate(){
    if(!incident||!server)return toast.error("Selecione um servidor e um incidente.");
    const detail=incidents.data?.find(i=>i.id===incident);
    if(!detail)return toast.error("Incidente não encontrado.");
    setBusy(true);
    try{
      const serverName=q.data?.servers.find(s=>s.id===server)?.name||"Servidor";
      const doc=pdfDocument([
        "STREAM MONITOR - RELATORIO DE INCIDENTE",
        "Gerado em: "+new Date().toLocaleString("pt-BR"),
        "Servidor: "+serverName,
        "Identificador: "+detail.id,
        "Tipo: "+(detail.incident_type||"Nao informado"),
        "Inicio: "+new Date(detail.started_at).toLocaleString("pt-BR"),
        "Recuperacao: "+(detail.ended_at?new Date(detail.ended_at).toLocaleString("pt-BR"):"Em aberto"),
        "Motivo observado: "+(detail.reason||"Nao registrado"),
        "Observacao: medidas de conectividade nao garantem reproducao audiovisual.",
        "Documento gerado por dados historicos; nao substitui auditoria independente."
      ]);
      await save(doc,title.trim()||"Relatório técnico","application/pdf");
      toast.success("Relatório PDF criado e guardado no Lovable Cloud.");
    }catch(e){toast.error(e instanceof Error?e.message:"Falha ao gerar relatório");}
    finally{setBusy(false);}
  }
  async function upload(){
    if(!file)return;
    if(!["image/png","application/pdf","text/csv","application/json"].includes(file.type))
      return toast.error("Formato não permitido. Use PNG, PDF, CSV ou JSON.");
    if(file.size>10*1024*1024)return toast.error("Arquivo acima de 10 MB.");
    setBusy(true);
    try{await save(file,title.trim()||file.name,file.type);setFile(null);toast.success("Evidência armazenada em espaço privado.");}
    catch(e){toast.error(e instanceof Error?e.message:"Falha no upload");}finally{setBusy(false);}
  }
  async function open(path:string|null){
    if(!path)return;
    const {data,error}=await supabase.storage.from("stream-evidence").createSignedUrl(path,180);
    if(error||!data?.signedUrl)return toast.error("Não foi possível criar link protegido.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }
  async function remove(doc:Evidence){
    if(!q.data||!confirm("Excluir definitivamente a evidência e seu arquivo?"))return;
    if(doc.storage_path){
      const {error}=await supabase.storage.from("stream-evidence").remove([doc.storage_path]);
      if(error)return toast.error("Não foi possível remover o arquivo.");
    }
    const {error}=await supabase.from("evidence_documents" as any).delete().eq("owner_id",q.data.owner).eq("id",doc.id);
    if(error)toast.error(error.message);else {toast.success("Arquivo excluído.");qc.invalidateQueries({queryKey:["evidence-library"]});}
  }
  return <div className="space-y-5 max-w-6xl">
    <Card className="p-6 bg-gradient-to-r from-blue-600/10 to-transparent border-blue-500/20">
      <h1 className="text-3xl font-bold flex items-center gap-3"><FileText className="text-blue-400"/> Biblioteca de Evidências</h1>
      <p className="text-sm text-muted-foreground mt-2">Relatórios PDF e arquivos de incidentes privados por revendedor, com links temporários e histórico no Lovable Cloud.</p>
    </Card>
    <div className="grid lg:grid-cols-2 gap-5">
      <Card className="p-5 space-y-3">
        <h2 className="font-bold">Nova evidência</h2>
        <label className="text-sm block">Título<Input className="mt-1" maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="text-sm block">Servidor<select className="mt-1 w-full border rounded p-2 bg-background" value={server} onChange={e=>{setServer(e.target.value);setIncident("");}}>
          <option value="">Sem servidor específico</option>{q.data?.servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-sm block">Incidente<select className="mt-1 w-full border rounded p-2 bg-background" value={incident} onChange={e=>setIncident(e.target.value)} disabled={!server}>
          <option value="">Selecione um incidente</option>{incidents.data?.map(i=><option key={i.id} value={i.id}>{new Date(i.started_at).toLocaleString("pt-BR")} · {i.incident_type||"Incidente"}</option>)}</select></label>
        <Button className="w-full" onClick={generate} disabled={busy||!incident}><FileText size={16} className="mr-2"/>Gerar e guardar PDF do incidente</Button>
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold">Anexar captura ou relatório</p>
          <Input type="file" accept=".png,.pdf,.csv,.json" onChange={e=>setFile(e.target.files?.[0]||null)}/>
          <Button variant="outline" className="w-full" disabled={!file||busy} onClick={upload}><UploadCloud size={16} className="mr-2"/>Enviar evidência</Button>
        </div>
      </Card>
      <Card className="p-5 space-y-3">
        <h2 className="font-bold">Arquivos protegidos</h2>
        <p className="text-xs text-muted-foreground flex gap-2"><ShieldCheck size={15}/> Bucket privado. Cada link assinado dura 3 minutos.</p>
        {q.isLoading&&<p>Carregando...</p>}
        {q.isError&&<p className="text-destructive text-sm">{String(q.error)}</p>}
        {q.data?.docs.length===0&&<p className="text-sm text-muted-foreground">Ainda não existem evidências.</p>}
        <div className="max-h-[650px] overflow-y-auto space-y-2">
          {q.data?.docs.map(doc=><div key={doc.id} className="border rounded-xl p-3 flex justify-between items-center gap-3">
            <div className="min-w-0"><div className="font-semibold text-sm truncate">{doc.title}</div><div className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleString("pt-BR")} · {doc.content_type}</div></div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={()=>open(doc.storage_path)} disabled={!doc.storage_path} aria-label="Abrir evidência"><Download size={16}/></Button>
              <Button size="sm" variant="ghost" onClick={()=>remove(doc)} aria-label="Excluir evidência"><Trash2 size={16}/></Button>
            </div>
          </div>)}
        </div>
      </Card>
    </div>
  </div>;
}
