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
import { Trash2, Bell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/alerts")({
  component: AlertsPage,
});

const KINDS = [
  { value: "email", label: "E-mail", placeholder: "voce@empresa.com", hint: "Envia via Resend. Requer domínio verificado para produção." },
  { value: "discord", label: "Discord", placeholder: "https://discord.com/api/webhooks/...", hint: "Cole o Webhook URL de um canal do Discord." },
  { value: "telegram", label: "Telegram", placeholder: "Ex.: 123456789", hint: "Abra o Telegram, envie /start para @StreamMonitorBot e depois use @userinfobot para descobrir seu chat_id. Cole aqui apenas o número." },
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
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-sm text-muted-foreground">Canais que recebem notificações quando um servidor cai (após o limite de falhas seguidas).</p>
      </div>

      <Card className="p-6">
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
          <div className="md:col-span-4">
            <Button type="submit" disabled={create.isPending}>Adicionar canal</Button>
          </div>
        </form>
      </Card>

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
    </div>
  );
}
