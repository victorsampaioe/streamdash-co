import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ExternalLink, ShieldCheck } from "lucide-react";

type StatusSettings = {
  owner_id: string; slug: string; display_name: string;
  description: string; is_public: boolean;
};
const normalize = (text: string) => text.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-")
  .replace(/^-+|-+$/g,"").slice(0,40);

export function ResellerStatusSettings() {
  const qc=useQueryClient();
  const [slug,setSlug]=useState("");
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [published,setPublished]=useState(false);
  const query=useQuery<StatusSettings|null>({
    queryKey:["my-reseller-status-page"],
    queryFn:async()=>{
      const {data:u}=await supabase.auth.getUser();
      if(!u.user)throw new Error("Faça login para editar.");
      const {data,error}=await (supabase as any).from("reseller_status_pages")
        .select("owner_id,slug,display_name,description,is_public")
        .eq("owner_id",u.user.id).maybeSingle();
      if(error)throw error;
      return data as StatusSettings|null;
    },
  });
  useEffect(()=>{
    if(query.data){
      setSlug(query.data.slug);setName(query.data.display_name);
      setDescription(query.data.description);setPublished(query.data.is_public);
    }
  },[query.data]);
  const save=useMutation({
    mutationFn:async()=>{
      const {data:u}=await supabase.auth.getUser();
      if(!u.user)throw new Error("Sessão não encontrada.");
      const clean=normalize(slug||name);
      if(clean.length<3)throw new Error("Escolha um endereço de 3 a 40 caracteres.");
      if(name.trim().length<2||name.trim().length>80)throw new Error("Informe um nome de 2 a 80 caracteres.");
      if(description.length>240)throw new Error("Descrição com no máximo 240 caracteres.");
      const {error}=await (supabase as any).from("reseller_status_pages").upsert({
        owner_id:u.user.id,slug:clean,display_name:name.trim(),
        description:description.trim(),is_public:published,
        updated_at:new Date().toISOString(),
      },{onConflict:"owner_id"});
      if(error)throw new Error(error.code==="23505"?"Este endereço já está em uso.":error.message);
      return clean;
    },
    onSuccess:clean=>{
      setSlug(clean);qc.invalidateQueries({queryKey:["my-reseller-status-page"]});
      toast.success("Status da revenda salvo.");
    },
    onError:(e:Error)=>toast.error(e.message),
  });
  const url=`https://streammonitor.site/status/revenda/${normalize(slug||name)}`;
  return <Card className="p-5 space-y-4">
    <div>
      <h2 className="font-semibold flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-blue-400"/> Página pública de status
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Um endereço separado da sua página comercial para clientes acompanharem disponibilidade.
        Só serão mostrados servidores marcados individualmente como públicos.
        Por padrão, essa página é privada.
      </p>
    </div>
    {query.isLoading&&<p className="text-sm">Carregando preferências...</p>}
    {query.isError&&<p role="alert" className="text-destructive text-sm">Não foi possível carregar a configuração.</p>}
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="space-y-1"><Label>Nome da página de status</Label>
        <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Minha Revenda"/></div>
      <div className="space-y-1"><Label>Endereço personalizado</Label>
        <Input value={slug} onChange={e=>setSlug(normalize(e.target.value))} placeholder="minha-revenda"/></div>
    </div>
    <div className="space-y-1"><Label>Descrição curta</Label>
      <Input value={description} onChange={e=>setDescription(e.target.value.slice(0,240))} placeholder="Status da nossa operação"/></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3">
      <div><p className="font-medium text-sm">Publicar status</p>
        <p className="text-xs text-muted-foreground">Requer seu consentimento e servidores públicos configurados</p></div>
      <Switch aria-label="Publicar página de status" checked={published} onCheckedChange={setPublished}/>
    </div>
    <p className="text-xs text-muted-foreground break-all">{url}</p>
    <div className="flex gap-2 flex-wrap">
      <Button disabled={save.isPending||query.isLoading||query.isError} onClick={()=>save.mutate()}>{save.isPending?"Salvando...":"Salvar configuração"}</Button>
      {!!query.data?.is_public&&<a href={url} target="_blank" rel="noopener noreferrer"><Button variant="outline"><ExternalLink className="w-4 h-4 mr-1"/>Abrir página</Button></a>}
    </div>
  </Card>;
}
