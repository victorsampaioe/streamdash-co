import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Bell, Send, Copy, ExternalLink, HelpCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { PremiumGate } from "@/components/subscription/premium-gate";

export const Route = createFileRoute("/_authenticated/app/alerts")({
  component: AlertsPage,
});

const KINDS = [
  { value: "email", label: "E-mail", placeholder: "voce@empresa.com", hint: "Envia via Resend. Requer domínio verificado para produção." },
  { value: "discord", label: "Discord", placeholder: "https://discord.com/api/webhooks/...", hint: "Cole o Webhook URL de um canal do Discord." },
  { value: "telegram", label: "Telegram", placeholder: "Ex.: 123456789", hint: "Abra o Telegram, envie /start para @MonitordeFluxoBot e depois use @userinfobot para descobrir seu chat_id. Cole aqui apenas o número." },
  { value: "webhook", label: "Webhook", placeholder: "https://sua-api.com/hook", hint: "Recebe POST JSON com o evento." },
] as const;

function AlertsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("email");
  const [target, setTarget] = useState("");

  const { data: channels = [] } = useQuery({
    queryKey: ["alert-channels"],
    queryFn: async () => (await supabase.from("alert_channels").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase.from("alert_channels").insert({
        owner_id: u.user.id, name: name || kind, kind, target,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alert-channels"] }); setName(""); setTarget(""); toast.success("Canal adicionado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("alert_channels").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-channels"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("alert_channels").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alert-channels"] }); toast.success("Canal removido"); },
  });

  const cur = KINDS.find((k) => k.value === kind)!;

  return (
    <div className="space-y-6 max-w-4xl w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground">Canais que recebem notificações quando um servidor cai (após o limite de falhas seguidas).</p>
      </div>

      <PremiumGate title="Criação de canais de alerta bloqueada">
      <Card className="p-4 sm:p-6">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-4 gap-3 items-end">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Time DevOps" />
          </div>
          <div className="space-y-2">
            <Label>Canal</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Destino</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={cur.placeholder} required />
          </div>
          <p className="text-xs text-muted-foreground md:col-span-4 -mt-1">{cur.hint}</p>
          {kind === "telegram" && (
            <div className="md:col-span-4">
              <TelegramGuide />
            </div>
          )}
          <div className="md:col-span-4">
            <Button type="submit" disabled={create.isPending}>Adicionar canal</Button>
          </div>
        </form>
      </Card>
      </PremiumGate>

      <Card>
        <div className="p-4 border-b border-border/60 flex items-center gap-2 text-sm font-medium">
          <Bell className="h-4 w-4" /> Canais configurados
        </div>
        {channels.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum canal.</p>
        ) : (
          <ul>
            {channels.map((c) => (
              <li key={c.id} className="p-4 border-b border-border/40 last:border-0 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground uppercase">{c.kind}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{c.target}</div>
                </div>
                <Switch checked={c.enabled} onCheckedChange={(v) => toggle.mutate({ id: c.id, enabled: v })} />
                <Button variant="ghost" size="icon" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <DigestCard />
    </div>

  );
}

const BOT_USERNAME = "MonitordeFluxoBot";

function DigestCard() {
  const send = useServerFn(sendMyDigestNow);
  const m = useMutation({
    mutationFn: async () => await send({}),
    onSuccess: (r: { ok: boolean; reason?: string }) =>
      r.ok ? toast.success("Resumo enviado no seu Telegram") : toast.error(r.reason ?? "Não foi possível enviar"),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Send className="h-4 w-4" /> Resumo inteligente no Telegram
      </div>
      <p className="text-sm text-muted-foreground">
        Todo dia às <strong>08:00</strong> e às <strong>20:00</strong> você recebe um resumo com o status dos seus
        servidores, novidades de catálogo (filmes, séries e canais), saúde média, incidentes, alertas, mudanças de IP,
        SSL/domínio a vencer — e um texto pronto para divulgar aos seus clientes.
      </p>
      <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? "Enviando..." : "Enviar resumo agora (teste)"}
      </Button>
    </Card>
  );
}


function TelegramGuide() {
  const steps = [
    { t: "Abra o nosso bot no Telegram", d: "Toque no botão abaixo ou procure por @MonitordeFluxoBot na busca do Telegram." },
    { t: "Envie /start para o bot", d: "Isso autoriza o bot a te enviar mensagens. Sem esse passo o Telegram bloqueia os alertas." },
    { t: "Descubra o seu código (chat_id)", d: "Abra o @userinfobot e envie /start. Ele responde com o seu Id, por exemplo: Id: 123456789." },
    { t: "Cole apenas o número aqui", d: "No campo Destino acima, cole somente os números do Id (sem @, sem espaços) e clique em Adicionar canal." },
  ];

  return (
    <Collapsible className="rounded-lg border border-border/60 bg-muted/30">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 p-3 text-sm font-medium">
          <HelpCircle className="h-4 w-4 text-primary" />
          Não sei pegar meu código do Telegram — me ensine
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-3">
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.t} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
              <div className="space-y-0.5">
                <p className="text-sm font-medium leading-tight">{s.t}</p>
                <p className="text-xs text-muted-foreground">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" asChild>
            <a href={`https://t.me/${BOT_USERNAME}`} target="_blank" rel="noreferrer">
              <Send className="h-4 w-4" /> Abrir @{BOT_USERNAME}
            </a>
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> Pegar meu código (@userinfobot)
            </a>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText("/start");
              toast.success("Comando /start copiado");
            }}
          >
            <Copy className="h-4 w-4" /> Copiar /start
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Dica: o código é só de números (ex.: 123456789). Se receber "chat not found", envie /start para o @{BOT_USERNAME} novamente.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
