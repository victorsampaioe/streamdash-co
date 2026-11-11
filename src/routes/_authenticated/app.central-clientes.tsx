import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LifeBuoy, Link2, Copy, ExternalLink, Save, ShieldCheck, Users, Globe, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/central-clientes")({
  head: () => ({ meta: [{ title: "Central dos Clientes | Stream Monitor" }, { name: "robots", content: "noindex" }] }),
  component: CustomerHelpSettings,
});

type HelpForm = {
  slug:string;display_name:string;tagline:string;logo_url:string;
  whatsapp:string;enabled:boolean;
};
type ServerInfo = {id:string;name:string};
const defaults:HelpForm={slug:"",display_name:"",tagline:"Central de Ajuda",logo_url:"",whatsapp:"",enabled:true};
function slugify(value:string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
}
function CustomerHelpSettings(){
  const qc=useQueryClient();
  const [form,setForm]=useState<HelpForm>(defaults);
  const [selected,setSelected]=useState<string[]>([]);
  const {data:account,isLoading}=useQuery({
    queryKey:["customer-help-settings-account"],
    queryFn:async()=>{
      const {data:{user},error}=await supabase.auth.getUser();
      if(error||!user)throw new Error("Faça login para configurar a central.");
      const [help,legacy,servers,allowed]=await Promise.all([
        (supabase as any).from("reseller_help_settings").select("*").eq("owner_id",user.id).maybeSingle(),
        (supabase as any).from("reseller_pages").select("slug,display_name,tagline,logo_url,whatsapp").eq("owner_id",user.id).maybeSingle(),
        supabase.from("servers").select("id,name").eq("owner_id",user.id).order("name"),
        (supabase as any).from("reseller_help_servers").select("server_id").eq("owner_id",user.id)
      ]);
      for(const r of [help,legacy,servers,allowed])if(r.error)throw r.error;
      return {
        userId:user.id,
        settings:help.data as HelpForm|null,
        legacy:legacy.data as Partial<HelpForm>|null,
        servers:(servers.data??[]) as ServerInfo[],
        selected:(allowed.data??[]).map((row:{server_id:string})=>row.server_id) as string[],
      };
    }
  });
  useEffect(()=>{
    if(!account)return;
    if(account.settings) {
      setForm({...defaults,...account.settings,logo_url:account.settings.logo_url??"",whatsapp:account.settings.whatsapp??""});
    } else if(account.legacy) {
      setForm({...defaults,...account.legacy,slug:account.legacy.slug??"",display_name:account.legacy.display_name??""});
    }
    setSelected(account.selected);
  },[account]);

  const save=useMutation({
    mutationFn:async()=>{
      if(!account)throw new Error("Conta indisponível.");
      const slug=slugify(form.slug||form.display_name);
      const name=form.display_name.trim();
      if(slug.length<2)throw new Error("Escolha um link válido, com pelo menos 2 caracteres.");
      if(name.length<2)throw new Error("Informe o nome da central.");
      const {error:settingsError}=await (supabase as any).from("reseller_help_settings").upsert({
        owner_id:account.userId,slug,display_name:name,
        tagline:form.tagline.trim().slice(0,160)||"Central de Ajuda",
        logo_url:form.logo_url.trim()||null,whatsapp:form.whatsapp.replace(/\D/g,"")||null,
        enabled:form.enabled,updated_at:new Date().toISOString()
      },{onConflict:"owner_id"});
      if(settingsError)throw new Error(settingsError.code==="23505"?"Esse link já está em uso por outra revenda.":settingsError.message);
      const previous=new Set(account.selected);
      const next=new Set(selected);
      const inserts=selected.filter(id=>!previous.has(id));
      const removals=account.selected.filter(id=>!next.has(id));
      if(inserts.length){
        const {error}=await (supabase as any).from("reseller_help_servers").insert(inserts.map(server_id=>({owner_id:account.userId,server_id})));
        if(error)throw error;
      }
      if(removals.length){
        const {error}=await (supabase as any).from("reseller_help_servers").delete().eq("owner_id",account.userId).in("server_id",removals);
        if(error)throw error;
      }
      return slug;
    },
    onSuccess:slug=>{
      setForm(v=>({...v,slug}));
      qc.invalidateQueries({queryKey:["customer-help-settings-account"]});
      toast.success("Central de Ajuda configurada!");
    },
    onError:(error:Error)=>toast.error(error.message)
  });
  const link=form.slug?`https://streammonitor.site/ajuda/${slugify(form.slug)}`:"";
  async function copy(){
    if(!link)return;
    try{await navigator.clipboard.writeText(link);toast.success("Link da central copiado!");}
    catch{toast.error("Não foi possível copiar o link.");}
  }
  return <div className="space-y-6 max-w-6xl">
    <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-[#071831] via-[#102b55] to-[#0b1e37] p-6 text-white sm:p-8">
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-300/20 bg-sky-400/10"><LifeBuoy className="h-6 w-6 text-sky-200"/></div>
        <div><p className="text-xs font-bold uppercase tracking-widest text-sky-300">Autoatendimento da revenda</p><h1 className="text-2xl font-extrabold sm:text-3xl">Central de Ajuda dos Clientes</h1></div>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">Crie seu link exclusivo para os clientes resolverem problemas comuns. Essa central tem configurações próprias e não altera a sua Página Pública.</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-sky-200">
        <span className="rounded-full bg-white/10 px-3 py-1.5">Sem login para o cliente</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5">Seus servidores escolhidos</span>
        <span className="rounded-full bg-white/10 px-3 py-1.5">Sem expor DNS privados</span>
      </div>
    </section>
    {isLoading?<Card className="p-6">Carregando suas configurações...</Card>:!account?<Card className="p-6">Não foi possível consultar sua conta.</Card>:<>
      <Card className="border-sky-500/20 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 font-bold"><Link2 className="h-5 w-5 text-sky-500"/> Link exclusivo da central</div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
          <span className="break-all font-mono text-xs sm:text-sm">{link||"Escolha o endereço da sua central abaixo"}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={copy} disabled={!link}><Copy className="mr-1 h-4 w-4"/> Copiar</Button>
          {link&&<Button size="sm" variant="outline" asChild><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-4 w-4"/> Abrir</a></Button>}</div>
        </div>
        <p className="text-xs text-muted-foreground">Compartilhe com seus clientes depois de salvar. Cada revendedor tem seu próprio endereço e sua própria seleção de servidores.</p>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Globe className="h-5 w-5 text-blue-500"/> Identidade da Central</h2>
          <div className="space-y-2"><Label>Nome da revenda</Label><Input maxLength={100} placeholder="Minha Revenda" value={form.display_name} onChange={e=>setForm(v=>({...v,display_name:e.target.value}))}/></div>
          <div className="space-y-2"><Label>Endereço exclusivo (slug)</Label><Input maxLength={40} placeholder="minha-revenda" value={form.slug} onChange={e=>setForm(v=>({...v,slug:slugify(e.target.value)}))}/><p className="text-xs text-muted-foreground">streammonitor.site/ajuda/{slugify(form.slug)||"minha-revenda"}</p></div>
          <div className="space-y-2"><Label>Mensagem de apresentação</Label><Input maxLength={160} value={form.tagline} onChange={e=>setForm(v=>({...v,tagline:e.target.value}))}/></div>
          <div className="space-y-2"><Label>URL da logo (HTTPS)</Label><Input placeholder="https://..." value={form.logo_url} onChange={e=>setForm(v=>({...v,logo_url:e.target.value}))}/></div>
          <div className="space-y-2"><Label><MessageCircle className="mr-1 inline h-4 w-4"/> WhatsApp do suporte</Label><Input placeholder="5585999999999" value={form.whatsapp} onChange={e=>setForm(v=>({...v,whatsapp:e.target.value}))}/></div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4"><span><strong className="block text-sm">Central publicada</strong><span className="block text-xs text-muted-foreground">Desligar oculta sua central sem afetar a página de status.</span></span><Switch checked={form.enabled} onCheckedChange={value=>setForm(v=>({...v,enabled:value}))}/></label>
        </Card>
        <Card className="space-y-5 p-5 sm:p-6">
          <div><h2 className="flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-blue-500"/> Servidores do autoatendimento</h2><p className="mt-1 text-sm text-muted-foreground">Marque somente os servidores que seus clientes poderão selecionar.</p></div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{selected.length} de {account.servers.length} escolhidos</span><div className="flex gap-3"><button type="button" className="text-blue-500 hover:underline" onClick={()=>setSelected(account.servers.map(s=>s.id))}>Selecionar todos</button><button type="button" className="hover:underline" onClick={()=>setSelected([])}>Limpar</button></div></div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto">{account.servers.map(server=><label key={server.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm hover:bg-muted/40"><span className="font-medium">{server.name}</span><Switch checked={selected.includes(server.id)} onCheckedChange={value=>setSelected(old=>value?[...old.filter(id=>id!==server.id),server.id]:old.filter(id=>id!==server.id))}/></label>)}
          {!account.servers.length&&<p className="text-sm text-muted-foreground">Cadastre primeiro seus servidores na área Servidores.</p>}</div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"/> A central pública não mostra host, usuário nem senha de seus servidores.</p>
        </Card>
      </div>
      <Button className="h-12 gap-2 bg-blue-600 text-white hover:bg-blue-500" disabled={save.isPending} onClick={()=>save.mutate()}><Save className="h-4 w-4"/>{save.isPending?"Salvando...":"Salvar Central de Ajuda"}</Button>
    </>}
  </div>;
}
