import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Bell, Send, Copy, ExternalLink, HelpCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { PremiumGate } from "@/components/subscription/premium-gate";
import { useServerFn } from "@tanstack/react-start";
import { sendMyDigestNow } from "@/lib/digest.functions";
import { testTelegramChat } from "@/lib/telegram-verify.functions";
import { updateTelegramStyle } from "@/lib/profile-settings.functions";
import { Check, CheckSquare, Square } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/alerts")({
  component: AlertsPage,
});

const BOT_USERNAME = "MonitordeFluxoBot";

function normalizeChatId(raw: string) {
  const t = String(raw ?? "").trim();
  return t.includes(":") ? t.split(":").slice(-1)[0].trim() : t;
}
function isValidChatId(raw: string) {
  return /^-?\d{5,20}$/.test(normalizeChatId(raw));
}

function AlertsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const test = useServerFn(testTelegramChat);

  const { data: profile } = useQuery({
    queryKey: ["profile-style"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("telegram_iptv_style").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  const { data: channels = [] } = useQuery({
    queryKey: ["alert-channels"],
    queryFn: async () =>
      (await supabase.from("alert_channels").select("*").eq("kind", "telegram").order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const chatId = normalizeChatId(target);
      if (!isValidChatId(chatId)) {
        throw new Error("Código inválido: use apenas os números do seu Id (ex.: 123456789).");
      }
      const check = await test({ data: { target: chatId } });
      if (!check.ok) throw new Error(`${check.error}${check.hint ? ` ${check.hint}` : ""}`);

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Não autenticado");
      const { error } = await supabase.from("alert_channels").insert({
        owner_id: u.user.id, name: name || "Telegram", kind: "telegram", target: chatId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-channels"] });
      qc.invalidateQueries({ queryKey: ["telegram-channels-banner"] });
      setName(""); setTarget("");
      toast.success("Telegram conectado! Confira a mensagem de teste no app.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("alert_channels").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-channels"] });
      qc.invalidateQueries({ queryKey: ["telegram-channels-banner"] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("alert_channels").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert-channels"] });
      qc.invalidateQueries({ queryKey: ["telegram-channels-banner"] });
      toast.success("Canal removido");
    },
  });

  const retest = useMutation({
    mutationFn: async (t: string) => await test({ data: { target: t } }),
    onSuccess: (r: { ok: boolean; error?: string; hint?: string }) =>
      r.ok ? toast.success("Mensagem de teste enviada no seu Telegram")
           : toast.error(`${r.error}${r.hint ? ` ${r.hint}` : ""}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const hasValid = channels.some((c) => c.enabled && isValidChatId(String(c.target ?? "")));

  return (
    <div className="space-y-6 max-w-4xl w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas no Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Os alertas do Stream Monitor são enviados pelo Telegram (@{BOT_USERNAME}): quedas de servidor, instabilidade e o resumo inteligente diário.
        </p>
      </div>

      {!hasValid && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">
              {channels.length > 0 ? "Seu Telegram está incorreto ou desativado" : "Você ainda não cadastrou o Telegram"}
            </p>
            <p className="text-muted-foreground">
              Sem um chat_id válido você não recebe alertas de queda nem o resumo diário. Siga o passo a passo abaixo — leva menos de 1 minuto.
            </p>
          </div>
        </div>
      )}

      <PremiumGate title="Cadastro do Telegram bloqueado">
        <Card className="p-4 sm:p-6 space-y-4">
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid md:grid-cols-3 gap-3 items-end">
            <div className="space-y-2">
              <Label>Nome (opcional)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meu Telegram" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Seu código do Telegram (chat_id)</Label>
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Ex.: 123456789"
                inputMode="numeric"
                required
                aria-invalid={target.length > 0 && !isValidChatId(target)}
              />
              {target.length > 0 && !isValidChatId(target) ? (
                <p className="text-xs text-destructive">
                  Código errado: cole somente os números do seu Id (sem @, sem espaços, sem link). Ex.: 123456789.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Vamos enviar uma mensagem de teste antes de salvar — se não chegar, avisamos o que corrigir.
                </p>
              )}
            </div>
            <div className="md:col-span-3">
              <TelegramGuide />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={create.isPending || !isValidChatId(target)}>
                {create.isPending ? "Validando..." : "Conectar Telegram"}
              </Button>
            </div>
          </form>
        </Card>
      </PremiumGate>

      <Card>
        <div className="p-4 border-b border-border/60 flex items-center gap-2 text-sm font-medium">
          <Bell className="h-4 w-4" /> Telegram cadastrado
        </div>
        {channels.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum Telegram cadastrado.</p>
        ) : (
          <ul>
            {channels.map((c) => {
              const valid = isValidChatId(String(c.target ?? ""));
              return (
                <li key={c.id} className="p-4 border-b border-border/40 last:border-0 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {valid ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> válido</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" /> código errado</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{c.target}</div>
                    {!valid && (
                      <p className="text-xs text-destructive mt-1">
                        Remova e cadastre novamente usando somente números do Id (pegue no @userinfobot).
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" disabled={retest.isPending} onClick={() => retest.mutate(String(c.target))}>
                    <Send className="h-4 w-4" /> Testar
                  </Button>
                  <Switch checked={c.enabled} onCheckedChange={(v) => toggle.mutate({ id: c.id, enabled: v })} />
                  <Button variant="ghost" size="icon" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <DigestCard />
      <TelegramStyleCard currentStyle={profile?.telegram_iptv_style || undefined} />
    </div>
  );
}

function TelegramStyleCard({ currentStyle }: { currentStyle?: string }) {
  const qc = useQueryClient();
  const updateStyle = useServerFn(updateTelegramStyle);
  const m = useMutation({
    mutationFn: async (style: "summary" | "important" | "individual") => await updateStyle({ data: { style } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-style"] });
      toast.success("Preferência atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const styles = [
    { id: "summary", label: "Receber resumo de novidades", desc: "Agrupa novos conteúdos e envia um relatório a cada 15 minutos." },
    { id: "important", label: "Receber alertas importantes", desc: "Mensagens imediatas apenas para conteúdos raros ou grandes atualizações." },
    { id: "individual", label: "Receber cada conteúdo individualmente", desc: "Alerta em tempo real para cada novo filme, série ou canal encontrado." },
  ];

  const styleValue = currentStyle || "summary";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bell className="h-4 w-4" /> Configuração Telegram: IPTV
      </div>
      <div className="space-y-3">
        {styles.map((s) => (
          <button
            key={s.id}
            onClick={() => m.mutate(s.id as any)}
            className="flex w-full items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <div className="mt-0.5">
              {styleValue === s.id ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-none">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

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
    { t: "Envie /start para o bot", d: "O próprio bot responde na hora com o seu código de vinculação (chat_id). Isso também autoriza o envio dos alertas." },
    { t: "Copie o número que o bot enviou", d: "Toque no número em destaque na resposta do bot para copiar (ex.: 123456789)." },
    { t: "Cole apenas o número aqui", d: "No campo acima, cole somente os números (sem @, sem espaços) e clique em Conectar Telegram." },
  ];

  return (
    <Collapsible defaultOpen className="rounded-lg border border-border/60 bg-muted/30">
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
