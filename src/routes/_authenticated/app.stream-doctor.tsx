import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ShieldCheck, Copy, CheckCircle2, MessageCircle, SearchCheck,
  AlertTriangle, BrainCircuit, Sparkles, Server, LockKeyhole, Zap, ArrowRight,
  Clock3, Cloud, Radio
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runStreamDoctor } from "@/lib/stream-doctor.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/stream-doctor")({
  head: () => ({ meta: [
    { title: "Stream Guardian Intelligence | Stream Monitor" },
    { name: "robots", content: "noindex" }
  ] }),
  component: StreamGuardianPage,
});
type Form = {
  serverId: string;
  device: "smart_tv" | "tv_box" | "phone" | "computer" | "other";
  app: string;
  symptom: "buffering" | "black_screen" | "login" | "vod" | "channels" | "audio" | "other";
  when: "now" | "today" | "recurring" | "unknown";
  complaint: string;
};
const devices = [
  {value:"smart_tv",label:"Smart TV"},{value:"tv_box",label:"TV Box / Fire TV"},
  {value:"phone",label:"Celular"},{value:"computer",label:"Computador"},{value:"other",label:"Outro aparelho"}
];
const symptoms = [
  {value:"buffering",label:"Travamentos / buffering"},{value:"black_screen",label:"Tela preta"},
  {value:"login",label:"Erro ao entrar"},{value:"vod",label:"Filmes / séries"},
  {value:"channels",label:"Canais ao vivo"},{value:"audio",label:"Áudio"},
  {value:"other",label:"Outro problema"}
];
const times = [
  {value:"now",label:"Neste momento"},{value:"today",label:"Começou hoje"},
  {value:"recurring",label:"Acontece com frequência"},{value:"unknown",label:"Não sei"}
];
function Field({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}) {
  return <label className="block space-y-2">
    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
    <select value={value} onChange={e=>onChange(e.target.value)}
      className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none transition focus-visible:border-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500/25">
      {options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
function StreamGuardianPage() {
  const [form,setForm]=useState<Form>({
    serverId:"",device:"smart_tv",app:"",symptom:"buffering",when:"now",complaint:""
  });
  const [result,setResult]=useState<Awaited<ReturnType<typeof runStreamDoctor>>|null>(null);
  const [working,setWorking]=useState(false);
  const analyze=useServerFn(runStreamDoctor);
  const {data:servers=[],isLoading}=useQuery({
    queryKey:["guardian-owned-servers"],
    queryFn:async ()=>{
      const {data,error}=await supabase.from("servers").select("id,name").order("name").limit(500);
      if(error)throw error;
      return data??[];
    },
  });
  async function run() {
    if(!form.serverId){toast.error("Selecione o servidor.");return;}
    setWorking(true);setResult(null);
    try {
      const session=await supabase.auth.getSession();
      const response=await analyze({data:{...form,accessToken:session.data.session?.access_token}});
      setResult(response);
    } catch(error) {
      toast.error(error instanceof Error?error.message:"Não foi possível investigar agora.");
    } finally {setWorking(false);}
  }
  const report=result?.report;
  const ai=result?.assistant;
  const aiOn=ai?.mode==="cloudflare" && !!ai.text;
  const message=report?(aiOn?
    ["Olá! 👋 Verificamos a reclamação pelo Stream Guardian.","",
    ai.text,"","Esta é uma análise preliminar com base nas medições disponíveis. Vamos confirmar os testes sugeridos."].join("\n")
    :report.whatsapp):"";
  async function copy(){
    try{await navigator.clipboard.writeText(message);toast.success("Mensagem copiada para o WhatsApp!");}
    catch{toast.error("Não foi possível copiar.");}
  }
  return <div className="w-full max-w-6xl space-y-6">
    <header className="relative isolate overflow-hidden rounded-3xl border border-sky-500/20 bg-[#07162E] p-6 text-white shadow-[0_20px_70px_-40px_#1165e5] sm:p-9">
      <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl"/>
      <div className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"/>
      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.15em] text-sky-200"><BrainCircuit className="h-3.5 w-3.5"/> Stream Guardian Intelligence</span>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">Diagnóstico sempre disponível</span>
          </div>
          <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl">Transforme reclamações em soluções.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">Investigue falhas de reprodução com os dados reais dos seus servidores. Quando disponível, a IA da Cloudflare explica os resultados e prepara uma orientação clara para o cliente.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-medium text-slate-200">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5"><Server className="h-3.5 w-3.5"/> Evidências reais</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5"><LockKeyhole className="h-3.5 w-3.5"/> Privado e protegido</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5"><Zap className="h-3.5 w-3.5"/> IA com franquia controlada</span>
          </div>
        </div>
        <div className="hidden h-32 w-32 items-center justify-center rounded-[2rem] border border-sky-300/20 bg-gradient-to-br from-sky-400/20 to-blue-600/10 shadow-inner lg:flex">
          <BrainCircuit className="h-16 w-16 text-sky-200"/>
        </div>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
      <Card className="space-y-6 border-sky-500/10 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/10"><SearchCheck className="h-5 w-5 text-sky-500"/></span>
          <div><h2 className="text-lg font-bold">Nova investigação</h2><p className="text-xs text-muted-foreground">Preencha os dados da reclamação.</p></div>
        </div>
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Servidor monitorado</span>
          <select className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm" value={form.serverId} onChange={e=>setForm(x=>({...x,serverId:e.target.value}))}>
            <option value="">{isLoading?"Carregando servidores...":"Selecione um servidor"}</option>
            {servers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="1 · Aparelho do cliente" value={form.device} options={devices} onChange={value=>setForm(x=>({...x,device:value as Form["device"]}))}/>
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">2 · Aplicativo utilizado</span>
            <Input className="h-12 rounded-xl" maxLength={60} placeholder="Ex.: app da Smart TV" value={form.app} onChange={e=>setForm(x=>({...x,app:e.target.value}))}/>
          </label>
          <Field label="3 · Qual é o problema?" value={form.symptom} options={symptoms} onChange={value=>setForm(x=>({...x,symptom:value as Form["symptom"]}))}/>
          <Field label="4 · Quando acontece?" value={form.when} options={times} onChange={value=>setForm(x=>({...x,when:value as Form["when"]}))}/>
        </div>
        <label className="block space-y-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Detalhe a reclamação (opcional)</span>
          <Textarea rows={3} maxLength={400} className="resize-none rounded-xl" placeholder="Ex.: acontece principalmente à noite, canais ao vivo funcionam mas filmes carregam..." value={form.complaint} onChange={e=>setForm(x=>({...x,complaint:e.target.value}))}/>
          <span className="block text-right text-[11px] text-muted-foreground">{form.complaint.length}/400</span>
        </label>
        <Button disabled={!form.serverId||working} onClick={run} className="h-12 w-full gap-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500">
          {working?<Activity className="h-4 w-4 animate-pulse"/>:<Sparkles className="h-4 w-4"/>}
          {working?"Investigando evidências...":"Analisar com Stream Guardian"}
          {!working&&<ArrowRight className="h-4 w-4"/>}
        </Button>
      </Card>

      <div className="space-y-4">
        <Card className="border-sky-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold"><Cloud className="h-4 w-4 text-blue-500"/> Duas camadas de inteligência</div>
          <div className="rounded-xl bg-muted/50 p-3"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-500"/> Motor técnico permanente</div><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Sempre cruza dados de monitoramento e orienta os próximos testes.</p></div>
          <div className="rounded-xl bg-blue-500/5 p-3"><div className="flex items-center gap-2 text-xs font-semibold"><BrainCircuit className="h-4 w-4 text-blue-500"/> IA Cloudflare sob demanda</div><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Explica o diagnóstico em linguagem natural, dentro dos limites gratuitos.</p></div>
        </Card>
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold"><Radio className="h-4 w-4 text-blue-500"/> Alertas preservados</div>
          <p className="text-xs leading-relaxed text-muted-foreground">O Telegram continua exclusivo para alertas e avisos de monitoramento. O atendimento inteligente funciona somente neste painel.</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5"/> Franquia: 3 solicitações por usuário/dia; 40 globais/dia.</div>
        </Card>
      </div>
    </div>

    {report&&<section aria-live="polite" className="space-y-5">
      <Card className="overflow-hidden border-blue-500/20">
        <div className="border-b border-border bg-gradient-to-r from-blue-500/10 to-sky-500/5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-bold"><BrainCircuit className="h-5 w-5 text-blue-500"/> Parecer do Stream Guardian</div>
            <span className={aiOn?"rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-300":"rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"}>
              {aiOn?"IA Cloudflare"+(ai?.cached?" · em cache":""):"Motor técnico local"}
            </span>
          </div>
          <h2 className="mt-4 text-xl font-extrabold">{report.headline}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{result.serverName} · {new Date(report.generatedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})} (Brasília)</p>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          {aiOn?<div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-300"><Sparkles className="h-4 w-4"/> Explicação da inteligência artificial</div>
            <p className="whitespace-pre-wrap text-sm leading-7">{ai.text}</p>
          </div>:<div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
            <p className="font-semibold">Análise técnica disponível.</p>
            <p className="mt-1 text-muted-foreground">A IA não foi utilizada nesta consulta. O motor local continua oferecendo evidências e recomendações, sem consumir franquia gratuita.</p>
            {ai?.reason==="limite_gratuito"&&<p className="mt-2 text-xs text-amber-600">Limite diário de IA atingido. Ele é renovado no próximo dia UTC.</p>}
          </div>}
          {typeof ai?.remaining==="number"&&<p className="text-xs text-muted-foreground">Consultas de IA restantes nesta franquia: até {ai.remaining}. O uso compartilhado também pode limitar a disponibilidade.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="h-4 w-4 text-sky-500"/> Evidências medidas</div>
              {report.evidence.map((line,i)=><p key={i} className="text-xs leading-6 text-muted-foreground">• {line}</p>)}
            </div>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-amber-500"/> Hipóteses — não confirmadas</div>
              {report.hypotheses.map((line,i)=><p key={i} className="text-xs leading-6 text-muted-foreground">• {line}</p>)}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-4 space-y-3">
            <h3 className="text-sm font-bold">Próximos passos seguros</h3>
            {report.steps.map((line,i)=><div key={i} className="flex items-start gap-2 text-sm leading-relaxed"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-blue-500"/>{line}</div>)}
          </div>
          <p className="text-xs text-muted-foreground">Nível de evidência: {report.confidence}. Este diagnóstico auxilia o atendimento; não substitui testes reais de reprodução no dispositivo.</p>
        </div>
      </Card>
      <Card className="space-y-4 border-emerald-500/15 p-5 sm:p-7">
        <div className="flex items-center gap-2 font-bold"><MessageCircle className="h-5 w-5 text-emerald-500"/> Mensagem pronta para o cliente</div>
        <pre className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-4 font-sans text-sm leading-relaxed">{message}</pre>
        <Button onClick={copy} className="gap-2"><Copy className="h-4 w-4"/> Copiar para WhatsApp</Button>
      </Card>
    </section>}
  </div>;
}
