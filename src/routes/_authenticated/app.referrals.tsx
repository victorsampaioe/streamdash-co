import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Gift, Share2, Users, CheckCircle2, Clock, Wallet, Sparkles, Send, DollarSign, UserPlus, Key } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getMyReferralSummary, requestPayout, createSubReseller } from "@/lib/referrals.functions";
import { formatBRL } from "@/lib/payments";

export const Route = createFileRoute("/_authenticated/app/referrals")({
  head: () => ({
    meta: [
      { title: "Indique e Ganhe — StreamMonitor" },
      { name: "description", content: "Ganhe R$ 10 via PIX por cada indicação que assinar um plano." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralsPage,
});

type ReferralRow = {
  id: string;
  referred_id: string;
  code_used: string;
  status: string;
  reward_cents: number | null;
  subscribed_at: string | null;
  paid_at: string | null;
  created_at: string;
};

type PayoutRow = {
  id: string;
  amount_cents: number;
  status: string;
  pix_type: string;
  pix_key: string;
  pix_name: string;
  admin_note: string | null;
  requested_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
};

function ReferralsPage() {
  const qc = useQueryClient();
  const getSummary = useServerFn(getMyReferralSummary);

  const { data: me } = useQuery({
    queryKey: ["my-profile-referral"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, referral_code, full_name")
        .eq("id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: referrals } = useQuery({
    queryKey: ["my-referrals"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as ReferralRow[];
      const { data } = await supabase
        .from("referrals")
        .select("id, referred_id, code_used, status, reward_cents, subscribed_at, paid_at, created_at")
        .eq("referrer_id", u.user.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as ReferralRow[];
    },
  });

  const { data: summary } = useQuery({
    queryKey: ["referral-summary"],
    queryFn: () => getSummary(),
  });

  const { data: payouts } = useQuery({
    queryKey: ["my-payouts"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as PayoutRow[];
      const { data } = await supabase
        .from("payout_requests")
        .select("id, amount_cents, status, pix_type, pix_key, pix_name, admin_note, requested_at, approved_at, paid_at, rejected_at")
        .eq("user_id", u.user.id)
        .order("requested_at", { ascending: false });
      return (data ?? []) as PayoutRow[];
    },
  });

  const code = me?.referral_code ?? "";
  const PUBLIC_SITE = "https://streammonitor.site";
  const shareUrl = code ? `${PUBLIC_SITE}/auth?ref=${code}` : "";

  const stats = summary ?? { total_referrals: 0, in_trial: 0, subscribed_count: 0, available_cents: 0, pending_cents: 0, paid_cents: 0 };
  const canRequest = stats.available_cents >= 1000;

  function copy(text: string, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  }

  async function share() {
    if (navigator.share && shareUrl) {
      try {
        await navigator.share({
          title: "StreamMonitor",
          text: "Monitore seus servidores com o StreamMonitor. Use meu código para liberar seu cadastro e teste 1 dia grátis!",
          url: shareUrl,
        });
      } catch { /* cancelled */ }
    } else {
      copy(shareUrl, "Link");
    }
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [resellerDialogOpen, setResellerDialogOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Promo banner */}
      <Card className="p-5 sm:p-6 border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent relative overflow-hidden">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col sm:flex-row items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-1.5">
            <h1 className="text-lg sm:text-xl font-bold">🚨💸 Indique amigos e ganhe dinheiro!</h1>
            <p className="text-sm text-muted-foreground">
              Compartilhe seu código exclusivo — ele é a <strong className="text-foreground">chave de acesso</strong> ao cadastro.
              Quem entrar por ele pode testar <strong className="text-foreground">1 dia grátis</strong> e,
              quando assinar um plano, você ganha <strong className="text-primary">R$ 10,00 via PIX</strong>.

            </p>
            <p className="text-sm font-medium">Quanto mais indicar, mais você ganha! 🚀</p>
          </div>
        </div>
      </Card>

      {/* New: Create Reseller Panel */}
      <Card className="p-6 border-success/30 bg-success/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-success" />
              Criar Painel para Sub-Revenda
            </h2>
            <p className="text-sm text-muted-foreground">
              Crie a conta para o seu sub-revenda com <strong>1 dia de teste</strong>.
              Ele já entra vinculado ao seu código e você ganha <strong>R$ 10</strong> se ele assinar.
            </p>
          </div>
          <Button size="lg" className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => setResellerDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Criar Sub-Revenda
          </Button>
        </div>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Metric icon={Users} label="Indicações" value={String(stats.total_referrals)} />
        <Metric icon={Clock} label="Em teste" value={String(stats.in_trial)} tone="warning" />
        <Metric icon={CheckCircle2} label="Assinaram" value={String(stats.subscribed_count)} tone="success" />
        <Metric icon={Wallet} label="Saldo disponível" value={formatBRL(stats.available_cents)} tone="primary" highlight />
        <Metric icon={DollarSign} label="Já recebido" value={formatBRL(stats.paid_cents)} />
      </div>

      {/* Code + link */}
      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Seu código</h2>
          <p className="text-xs text-muted-foreground">Compartilhe com quem quiser.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={code} className="font-mono text-lg tracking-widest text-center sm:max-w-xs" />
          <Button variant="outline" onClick={() => copy(code, "Código")}>
            <Copy className="h-4 w-4 mr-2" /> Copiar código
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={shareUrl} className="text-xs" />
          <Button onClick={share}>
            <Share2 className="h-4 w-4 mr-2" /> Compartilhar link
          </Button>
        </div>
      </Card>

      {/* Solicitar PIX */}
      <Card className="p-6 border-primary/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Receber via PIX</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Você pode solicitar quando tiver pelo menos <strong>{formatBRL(1000)}</strong> de saldo disponível.
            </p>
            {stats.pending_cents > 0 && (
              <p className="text-xs text-warning mt-1">
                {formatBRL(stats.pending_cents)} aguardando análise do administrador.
              </p>
            )}
          </div>
          <Button size="lg" disabled={!canRequest} onClick={() => setDialogOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            Solicitar Pagamento
          </Button>
        </div>
      </Card>

      <RequestPayoutDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        amountCents={stats.available_cents}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["referral-summary"] });
          qc.invalidateQueries({ queryKey: ["my-referrals"] });
          qc.invalidateQueries({ queryKey: ["my-payouts"] });
        }}
      />

      <CreateResellerDialog
        open={resellerDialogOpen}
        onOpenChange={setResellerDialogOpen}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["referral-summary"] });
          qc.invalidateQueries({ queryKey: ["my-referrals"] });
        }}
      />

      {/* Referrals list */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Histórico de indicações</h2>
        {(referrals?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma indicação ainda. Comece compartilhando seu código!</p>
        ) : (
          <div className="space-y-2">
            {referrals!.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">#{r.referred_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <ReferralStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Payout history */}
      {(payouts?.length ?? 0) > 0 && (
        <Card className="p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Send className="h-4 w-4 text-muted-foreground" /> Solicitações de PIX</h2>
          <div className="space-y-3">
            {payouts!.map((p) => (
              <div key={p.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{formatBRL(p.amount_cents)}</div>
                  <PayoutStatusBadge status={p.status} />
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {p.pix_type.toUpperCase()} · {p.pix_key} · {p.pix_name}
                </div>
                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
                  <span>Solicitado em {new Date(p.requested_at).toLocaleDateString("pt-BR")}</span>
                  {p.approved_at && <span>· Aprovado em {new Date(p.approved_at).toLocaleDateString("pt-BR")}</span>}
                  {p.paid_at && <span>· Pago em {new Date(p.paid_at).toLocaleDateString("pt-BR")}</span>}
                  {p.rejected_at && <span className="text-destructive">· Recusado em {new Date(p.rejected_at).toLocaleDateString("pt-BR")}</span>}
                </div>
                {p.admin_note && <p className="text-xs italic text-muted-foreground">Nota: {p.admin_note}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function RequestPayoutDialog({ open, onOpenChange, amountCents, onDone }: { open: boolean; onOpenChange: (b: boolean) => void; amountCents: number; onDone: () => void }) {
  const [pixType, setPixType] = useState<"cpf" | "phone" | "email" | "random">("cpf");
  const [pixKey, setPixKey] = useState("");
  const [pixName, setPixName] = useState("");
  const req = useServerFn(requestPayout);
  const mut = useMutation({
    mutationFn: () => req({ data: { pixType, pixKey, pixName } }),
    onSuccess: () => {
      toast.success("Solicitação enviada com sucesso! Pagamento em até 2 dias úteis.");
      setPixKey(""); setPixName("");
      onDone();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Receber via PIX</DialogTitle>
          <DialogDescription>
            Preencha os dados da sua chave PIX para receber o valor acumulado das suas indicações.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo da chave</Label>
            <Select value={pixType} onValueChange={(v) => setPixType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="random">Chave aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nome do recebedor</Label>
            <Input value={pixName} onChange={(e) => setPixName(e.target.value)} placeholder="Nome completo do titular" />
          </div>
          <div className="space-y-2">
            <Label>Chave PIX</Label>
            <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Digite sua chave PIX" />
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">Saldo disponível</div>
            <div className="text-2xl font-bold text-primary">{formatBRL(amountCents)}</div>
          </div>
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
            ⚠️ Após solicitar o pagamento, nossa equipe realizará a conferência e o PIX será enviado em até <strong>2 dias úteis</strong>.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !pixKey.trim() || !pixName.trim()}>
            {mut.isPending ? "Enviando..." : "Solicitar Recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferralStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending": return <Badge variant="outline">Pendente</Badge>;
    case "trial_active": return <Badge variant="outline" className="border-warning/40 text-warning">Em teste</Badge>;
    case "subscribed": return <Badge className="bg-success text-success-foreground">Assinou · +R$10</Badge>;
    case "requested": return <Badge variant="outline" className="border-primary/40 text-primary">PIX solicitado</Badge>;
    case "approved": return <Badge variant="outline" className="border-primary/40 text-primary">PIX aprovado</Badge>;
    case "paid": return <Badge className="bg-primary text-primary-foreground">PIX pago</Badge>;
    case "cancelled": return <Badge variant="destructive">Cancelado</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function PayoutStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "requested": return <Badge variant="outline" className="border-warning/40 text-warning">Solicitado</Badge>;
    case "approved": return <Badge variant="outline" className="border-primary/40 text-primary">Aprovado</Badge>;
    case "paid": return <Badge className="bg-success text-success-foreground">PIX enviado</Badge>;
    case "rejected": return <Badge variant="destructive">Recusado</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function Metric({ icon: Icon, label, value, tone, highlight }: { icon: any; label: string; value: string; tone?: "primary" | "success" | "warning"; highlight?: boolean }) {
  const toneCls =
    tone === "primary" ? "text-primary" :
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" : "";
  return (
    <Card className={"p-4 " + (highlight ? "border-primary/50 bg-primary/5" : "")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={"mt-1 text-2xl font-bold " + toneCls}>{value}</div>
    </Card>
  );
}
