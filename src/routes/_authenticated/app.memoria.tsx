import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Brain, Check, Search, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/memoria")({
  component: DiagnosticMemory,
  head: () => ({ meta: [{ title: "Memória de Diagnósticos | Stream Monitor" }] }),
});
type Case = { id:string;server_id:string|null;error_kind:string;device_kind:string|null;app_name:string|null;region_code:string|null;solution:string|null;outcome:string;consented:boolean;anonymized:boolean;created_at:string };
const categories = [
  ["buffer","Travando/carregando"],["black","Tela preta"],["login","Login"],["vod","Filmes e séries"],
  ["live","TV ao vivo"],["audio","Áudio"],["other","Outro"],
] as const;
function DiagnosticMemory(){
  const qc=useQueryClient();
  const [errorKind,setErrorKind]=useState("buffer");
  const [serverId,setServerId]=useState("");
  const [device,setDevice]=useState("");
  const [app,setApp]=useState("");
  const [region,setRegion]=useState("");
  const [solution,setSolution]=useState("");
  const [outcome,setOutcome]=useState("resolved");
  const [consent,setConsent]=useState(false);
  const [saving,setSaving]=useState(false);
  const [term,setTerm]=useState("");
  const q=useQuery({queryKey:["diagnostic-cases"],queryFn:async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw new Error("Faça login.");
    const [cases,servers]=await Promise.all([
      supabase.from("diagnostic_case_memory").select("id,server_id,error_kind,device_kind,app_name,region_code,solution,outcome,consented,anonymized,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(150),
      supabase.from("servers").select("id,name").eq("owner_id",user.id).order("name"),
    ]);
    if(cases.error)throw cases.error;if(servers.error)throw servers.error;
    return {owner:user.id,cases:cases.data??[],servers:servers.data??[]};
  },staleTime:30000});
  const matches=(q.data?.cases??[]).filter(c=>([c.solution,c.app_name,c.error_kind,c.device_kind].join(" ").toLowerCase().includes(term.toLowerCase())));
  async function save(){
    if(!q.data)return;
    setSaving(true);
    try{
      if(solution.trim().length<10)throw new Error("Descreva a solução aplicada com pelo menos 10 caracteres.");
      if(consent && outcome!=="resolved")throw new Error("Compartilhe apenas soluções de casos resolvidos.");
      const {error}=await supabase.from("diagnostic_case_memory" as any).insert({
        owner_id:q.data.owner,server_id:serverId||null,error_kind:errorKind,
        device_kind:device.trim().slice(0,80)||null,app_name:app.trim().slice(0,80)||null,
        region_code:region.trim().slice(0,20)||null,
        solution:solution.trim().slice(0,800),outcome,
        anonymized:consent,consented:consent,
        resolved_at:outcome==="resolved"?new Date().toISOString():null
      });
      if(error)throw error;
      setSolution("");setConsent(false);
      await qc.invalidateQueries({queryKey:["diagnostic-cases"]});
      toast.success("Caso armazenado no Lovable Cloud.");
    }catch(e){toast.error(e instanceof Error?e.message:"Erro ao registrar caso");}
    finally{setSaving(false);}
  }
  async function remove(id:string){
    if(!q.data || !confirm("Excluir este caso de forma permanente?"))return;
    const {error}=await supabase.from("diagnostic_case_memory" as any).delete().eq("owner_id",q.data.owner).eq("id",id);
    if(error)toast.error(error.message);else {toast.success("Caso excluído.");qc.invalidateQueries({queryKey:["diagnostic-cases"]});}
  }
  return <div className="space-y-5 max-w-6xl">
    <Card className="p-6 bg-gradient-to-br from-blue-600/15 to-transparent border-blue-500/20">
      <h1 className="text-3xl font-bold flex items-center gap-3"><Brain size={28} className="text-blue-400"/> Memória de Diagnósticos</h1>
      <p className="text-sm text-muted-foreground mt-2">Registre soluções reais e reutilize conhecimentos de incidentes anteriores. Apenas casos anonimizados e autorizados podem gerar dicas públicas para seus clientes.</p>
    </Card>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <Card className="p-5 space-y-3">
        <h2 className="font-bold">Registrar caso resolvido</h2>
        <label className="text-sm block">Tipo de erro<select value={errorKind} onChange={e=>setErrorKind(e.target.value)} className="w-full mt-1 border bg-background rounded p-2">{categories.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-sm block">Servidor<select value={serverId} onChange={e=>setServerId(e.target.value)} className="w-full mt-1 border bg-background rounded p-2"><option value="">Geral da revenda</option>{q.data?.servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Aparelho<Input className="mt-1" maxLength={80} value={device} onChange={e=>setDevice(e.target.value)} placeholder="Smart TV"/></label>
          <label className="text-sm">Aplicativo<Input className="mt-1" maxLength={80} value={app} onChange={e=>setApp(e.target.value)} placeholder="Aplicativo utilizado"/></label>
        </div>
        <label className="text-sm block">Região (opcional)<Input className="mt-1" maxLength={20} value={region} onChange={e=>setRegion(e.target.value)} placeholder="CE"/></label>
        <label className="text-sm block">Solução comprovada<Textarea className="mt-1" value={solution} maxLength={800} onChange={e=>setSolution(e.target.value)} placeholder="Descreva os testes e o que realmente resolveu. Não inclua senhas, IPs privados, nomes ou dados pessoais."/></label>
        <label className="text-sm block">Resultado<select className="mt-1 w-full border bg-background rounded p-2" value={outcome} onChange={e=>{setOutcome(e.target.value);if(e.target.value!=="resolved")setConsent(false);}}><option value="resolved">Resolvido</option><option value="unresolved">Não resolvido</option><option value="pending">Em andamento</option></select></label>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-1" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={outcome!=="resolved"}/>Permitir que esta solução, sem dados pessoais, seja mostrada como sugestão na Central de Ajuda pública da minha revenda.</label>
        <Button className="w-full" onClick={save} disabled={saving||q.isLoading}><Check size={16} className="mr-2"/>{saving?"Salvando...":"Salvar conhecimento"}</Button>
      </Card>
      <Card className="p-5 space-y-3 min-w-0">
        <h2 className="font-bold">Biblioteca de casos reais</h2>
        <div className="relative"><Search className="absolute top-3 left-3 text-muted-foreground" size={16}/><Input className="pl-9" value={term} onChange={e=>setTerm(e.target.value)} placeholder="Pesquisar erros e soluções"/></div>
        {q.isLoading&&<p>Carregando memória...</p>}
        {q.isError&&<p className="text-sm text-destructive">Erro: {String(q.error)}</p>}
        <div className="space-y-3 max-h-[730px] overflow-auto">
          {matches.length===0 && <p className="text-sm text-muted-foreground">Nenhum caso encontrado.</p>}
          {matches.map(c=><div key={c.id} className="border rounded-xl p-4 space-y-2">
            <div className="flex justify-between gap-2"><div className="font-semibold">{categories.find(x=>x[0]===c.error_kind)?.[1]||c.error_kind}</div><Button size="sm" variant="ghost" aria-label="Excluir caso" onClick={()=>remove(c.id)}><Trash2 size={16}/></Button></div>
            <p className="text-sm whitespace-pre-wrap">{c.solution}</p>
            <p className="text-xs text-muted-foreground">{c.device_kind||"Aparelho não informado"} · {c.outcome==="resolved"?"Resolvido":c.outcome==="pending"?"Em andamento":"Não resolvido"} · {new Date(c.created_at).toLocaleDateString("pt-BR")}</p>
            {c.consented&&c.anonymized&&<div className="text-xs text-blue-400">Solução permitida na Central pública</div>}
          </div>)}
        </div>
      </Card>
    </div>
  </div>;
}
