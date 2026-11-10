import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Stethoscope, ShieldCheck, Copy, CheckCircle2, MessageCircle, SearchCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runStreamDoctor } from "@/lib/stream-doctor.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/stream-doctor")({
  head: () => ({ meta: [{ title: "Stream Doctor — Stream Monitor" }, { name: "robots", content: "noindex" }] }),
  component: StreamDoctorPage,
});

type DoctorInput = {
  serverId: string;
  device: "smart_tv" | "tv_box" | "phone" | "computer" | "other";
  app: string;
  symptom: "buffering" | "black_screen" | "login" | "vod" | "channels" | "audio" | "other";
  when: "now" | "today" | "recurring" | "unknown";
};
const deviceOptions = [
  { value: "smart_tv", label: "Smart TV" }, { value: "tv_box", label: "TV Box / Fire TV" },
  { value: "phone", label: "Celular" }, { value: "computer", label: "Computador" }, { value: "other", label: "Outro" },
];
const symptomOptions = [
  { value: "buffering", label: "Travando / carregando" }, { value: "black_screen", label: "Tela preta" },
  { value: "login", label: "Erro ao entrar" }, { value: "vod", label: "Filmes ou séries" },
  { value: "channels", label: "Canais ao vivo" }, { value: "audio", label: "Sem áudio" },
  { value: "other", label: "Outro problema" },
];
const whenOptions = [
  { value: "now", label: "Agora" }, { value: "today", label: "Hoje" },
  { value: "recurring", label: "Acontece sempre" }, { value: "unknown", label: "Não sei" },
];
function Dropdown({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return <label className="space-y-2 block">
    <span className="text-sm font-semibold">{label}</span>
    <select className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
function StreamDoctorPage() {
  const [form, setForm] = useState<DoctorInput>({
    serverId: "", device: "smart_tv", app: "", symptom: "buffering", when: "now"
  });
  const [result, setResult] = useState<Awaited<ReturnType<typeof runStreamDoctor>> | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useServerFn(runStreamDoctor);
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["stream-doctor-servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id,name").order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function diagnose() {
    if (!form.serverId) return toast.error("Selecione o servidor que deseja analisar.");
    setBusy(true); setResult(null);
    try {
      const response = await run({ data: form });
      setResult(response);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível executar o diagnóstico.");
    } finally { setBusy(false); }
  }
  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.report.whatsapp); toast.success("Resposta copiada!"); }
    catch { toast.error("Não foi possível copiar a mensagem."); }
  }
  const report = result?.report;

  return <div className="sm-page w-full max-w-6xl space-y-6">
    <section className="relative overflow-hidden rounded-3xl border border-blue-500/25 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white sm:p-9">
      <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-blue-200 uppercase"><Stethoscope className="h-5 w-5" /> Stream Doctor</div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Médico inteligente do cliente</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">O cliente reclamou? Responda quatro perguntas e investigue com dados reais do seu monitoramento, sem precisar de API de inteligência artificial.</p>
      <div className="mt-5 flex flex-wrap gap-3 text-xs text-blue-100"><span className="rounded-full bg-white/10 px-3 py-2">✓ Sem API de IA</span><span className="rounded-full bg-white/10 px-3 py-2">✓ Dados reais</span><span className="rounded-full bg-white/10 px-3 py-2">✓ Mensagem para WhatsApp</span></div>
    </section>

    <Card className="p-5 sm:p-7 space-y-6">
      <div><h2 className="text-lg font-bold">Vamos investigar a reclamação</h2><p className="mt-1 text-sm text-muted-foreground">Selecione um servidor da sua conta e descreva o problema.</p></div>
      <label className="block space-y-2"><span className="text-sm font-semibold">Servidor monitorado</span>
        <select className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm" value={form.serverId} onChange={e => setForm(x => ({ ...x, serverId: e.target.value }))}>
          <option value="">{isLoading ? "Carregando..." : "Escolha um servidor"}</option>
          {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Dropdown label="1. Qual aparelho?" value={form.device} options={deviceOptions} onChange={value => setForm(x => ({ ...x, device: value as DoctorInput["device"] }))} />
        <label className="block space-y-2"><span className="text-sm font-semibold">2. Qual aplicativo?</span>
          <Input className="h-11" maxLength={60} placeholder="Ex.: aplicativo da TV" value={form.app} onChange={e => setForm(x => ({ ...x, app: e.target.value }))} />
        </label>
        <Dropdown label="3. Qual problema?" value={form.symptom} options={symptomOptions} onChange={value => setForm(x => ({ ...x, symptom: value as DoctorInput["symptom"] }))} />
        <Dropdown label="4. Quando acontece?" value={form.when} options={whenOptions} onChange={value => setForm(x => ({ ...x, when: value as DoctorInput["when"] }))} />
      </div>
      <Button className="w-full sm:w-auto h-11 gap-2" onClick={diagnose} disabled={!form.serverId || busy}>{busy ? <Activity className="h-4 w-4 animate-pulse" /> : <SearchCheck className="h-4 w-4" />}{busy ? "Analisando evidências..." : "Investigar problema"}</Button>
    </Card>

    {report && <section className="space-y-5" aria-live="polite">
      <Card className="p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-lg">{report.severity === "critical" ? <AlertTriangle className="h-5 w-5 text-red-500" /> : report.severity === "warning" ? <Activity className="h-5 w-5 text-orange-500" /> : <ShieldCheck className="h-5 w-5 text-sky-500" />} Resultado do Stream Doctor</div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">Evidência: {report.confidence}</span>
        </div>
        <h2 className="text-xl font-bold">{report.headline}</h2>
        <p className="text-xs text-muted-foreground">Servidor: {result?.serverName} · {new Date(report.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold text-sm">Evidências observadas</h3>
            {report.evidence.map((line, i) => <p key={i} className="text-sm text-muted-foreground">• {line}</p>)}
          </div>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold text-sm">Possíveis causas (não confirmadas)</h3>
            {report.hypotheses.map((line, i) => <p key={i} className="text-sm text-muted-foreground">• {line}</p>)}
          </div>
        </div>
        <div className="rounded-xl bg-muted/40 p-4 space-y-3"><h3 className="font-semibold text-sm">Próximos passos recomendados</h3>
          {report.steps.map((line, i) => <div key={i} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" /> {line}</div>)}
        </div>
      </Card>
      <Card className="p-5 sm:p-7 space-y-4">
        <div className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-500" /><h2 className="text-lg font-bold">Resposta pronta para WhatsApp</h2></div>
        <pre className="whitespace-pre-wrap break-words rounded-xl bg-muted/50 p-4 text-sm font-sans">{report.whatsapp}</pre>
        <Button className="gap-2" onClick={copy}><Copy className="h-4 w-4" /> Copiar resposta</Button>
      </Card>
    </section>}
  </div>;
}
