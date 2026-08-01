import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock, Copy, CreditCard, Loader2, QrCode, RefreshCw, ShieldCheck, Sparkles, Timer, X, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSubscription, planLabel, statusLabel } from "@/hooks/use-subscription";
import { PLANS, formatBRL, type PlanId } from "@/lib/payments";
import { createPixPayment, getPaymentStatus } from "@/lib/mercadopago.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/subscription")({
  head: () => ({
    meta: [
      { title: "Minha Assinatura — StreamMonitor" },
      { name: "description", content: "Gerencie sua assinatura e renove seu plano StreamMonitor com PIX." },
      { property: "og:title", content: "Minha Assinatura — StreamMonitor" },
      { property: "og:description", content: "Gerencie sua assinatura e renove seu plano StreamMonitor com PIX." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const { data, isLoading, refetch } = useSubscription();
  const [openPlan, setOpenPlan] = useState<PlanId | null>(null);
  const [pix, setPix] = useState<Awaited<ReturnType<typeof createPixPayment>> | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const createPix = useServerFn(createPixPayment);
  const navigate = useNavigate();

  const sub = data?.subscription;

  const handlePaid = useCallback(async () => {
    await refetch();
    toast.success("Pagamento confirmado! Assinatura ativada e recursos liberados.");
    setOpenPlan(null);
    setPix(null);
    // Libera o acesso na hora e leva o usuário ao painel já desbloqueado.
    navigate({ to: "/app" });
  }, [refetch, navigate]);

  async function handleRenew(plan: PlanId) {
    setOpenPlan(plan);
    setLoading(true);
    setPix(null);
    setPaymentError(null);
    try {
      const res = await createPix({ data: { plan } });
      setPix(res);
      if (!res.integrationReady) {
        toast.info("Estrutura de pagamento pronta. Configure o Mercado Pago para gerar o QR Code PIX.");
      }
      refetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao iniciar pagamento";
      setPaymentError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Minha Assinatura</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie seu plano e renovações.</p>
      </div>

      {isLoading ? (
        <Card className="p-6"><p className="text-sm text-muted-foreground">Carregando...</p></Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Plano {sub ? planLabel(sub.plan) : "—"}</h2>
                {sub && (
                  <Badge variant={data?.isExpired ? "destructive" : data?.isExpiringSoon ? "outline" : "default"}>
                    {statusLabel(sub.status)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <Metric icon={Clock} label="Dias restantes" value={sub ? `${data?.daysRemaining ?? 0} dia(s)` : "—"} highlight={data?.isExpiringSoon} danger={data?.isExpired} />
                <Metric icon={CalendarDays} label="Vencimento" value={sub ? new Date(sub.expires_at).toLocaleDateString("pt-BR") : "—"} />
                <Metric icon={CheckCircle2} label="Cadastrado em" value={sub ? new Date(sub.started_at).toLocaleDateString("pt-BR") : "—"} />
              </div>
            </div>
          </div>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">
          {data?.isExpired ? "Renovar Assinatura" : "Fazer upgrade"}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLANS.map((plan) => (
            <Card key={plan.id} className={cn("p-6 relative", plan.highlight && "border-primary/60 ring-1 ring-primary/30")}>
              {plan.highlight && <Badge className="absolute -top-2 right-4">Mais popular</Badge>}
              <div className="space-y-3">
                <h3 className="font-semibold">{plan.name}</h3>
                <div className="text-3xl font-bold">
                  {formatBRL(plan.priceCents)}
                  <span className="text-sm text-muted-foreground font-normal"> /{plan.id === "monthly" ? "mês" : "ano"}</span>
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {plan.perks.map((p) => (
                    <li key={p} className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-success" />{p}</li>
                  ))}
                </ul>
                <Button className="w-full" onClick={() => handleRenew(plan.id)}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {data?.isExpired ? "Renovar" : "Assinar"} com PIX
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <PixDialog
        openPlan={openPlan}
        onClose={() => { setOpenPlan(null); setPix(null); setPaymentError(null); }}
        pix={pix}
        loading={loading}
        error={paymentError}
        onPaid={handlePaid}
      />
    </div>
  );
}

function PixDialog({ openPlan, onClose, pix, loading, error, onPaid }: {
  openPlan: PlanId | null;
  onClose: () => void;
  pix: Awaited<ReturnType<typeof createPixPayment>> | null;
  loading: boolean;
  error: string | null;
  onPaid: () => Promise<void>;
}) {
  const getStatus = useServerFn(getPaymentStatus);
  const [remaining, setRemaining] = useState<number>(0);
  const [checking, setChecking] = useState(false);
  const pixCode = typeof pix?.copyPaste === "string" ? pix.copyPaste.trim() : "";

  // Countdown
  useEffect(() => {
    if (!pix?.expiresAt) return;
    const tick = () => {
      const ms = new Date(pix.expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pix?.expiresAt]);

  // Confirm directly with Mercado Pago every 3s. This also covers delayed webhooks.
  useEffect(() => {
    if (!pix?.paymentId || !pix.integrationReady) return;
    let stop = false;
    let polling = false;
    let id: ReturnType<typeof setInterval>;
    const poll = async () => {
      if (stop || polling) return;
      polling = true;
      try {
        const row = await getStatus({ data: { paymentId: pix.paymentId } });
        if (row?.status === "approved" && !stop) {
          stop = true;
          clearInterval(id);
          await onPaid();
        }
      } catch {
        // A temporary provider error is retried on the next poll.
      } finally {
        polling = false;
      }
    };
    void poll();
    id = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [pix?.paymentId, pix?.integrationReady, getStatus, onPaid]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  async function checkNow() {
    if (!pix?.paymentId) return;
    setChecking(true);
    try {
      const row = await getStatus({ data: { paymentId: pix.paymentId } });
      if (row?.status === "approved") await onPaid();
      else toast.info("Ainda não identificamos o pagamento. Aguarde alguns segundos após pagar.");
    } finally {
      setChecking(false);
    }
  }

  function copyCode() {
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode);
    toast.success("Código PIX copiado!");
  }

  return (
    <Dialog open={!!openPlan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-md p-0 gap-0 overflow-hidden border-0 bg-transparent shadow-2xl">
        <div className="relative flex max-h-[90vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          {/* Header */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary/25 via-primary/10 to-card p-5 sm:p-6">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 border border-primary/30">
                  <QrCode className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-0.5">
                  <DialogTitle className="text-base sm:text-lg font-semibold leading-tight">Pagamento via PIX</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">Aprovação automática · Ativa na hora</DialogDescription>
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-full bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {pix && (
              <div className="relative mt-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">Total a pagar</div>
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight">{formatBRL(pix.amountCents)}</div>
                  {pix.discountApplied && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] text-success">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      <span>Desconto de indicação aplicado</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 rounded-xl border bg-card/80 px-3 py-2 backdrop-blur">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expira em</div>
                  <div className={cn("font-mono text-sm font-semibold tabular-nums flex items-center gap-1", remaining < 60 && remaining > 0 && "text-destructive")}>
                    <Timer className="h-3.5 w-3.5" />
                    {mm}:{ss}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {loading && (
              <div className="space-y-5 py-4">
                <div className="mx-auto h-56 w-56 rounded-2xl bg-muted animate-pulse" />
                <div className="space-y-2">
                  <div className="mx-auto h-4 w-40 rounded bg-muted animate-pulse" />
                  <div className="mx-auto h-3 w-28 rounded bg-muted animate-pulse" />
                </div>
                <div className="mx-auto h-9 w-full rounded-lg bg-muted animate-pulse" />
              </div>
            )}

            {!loading && !error && pix?.integrationReady && pixCode && (
              <div className="space-y-5">
                {/* QR Card */}
                <div className="mx-auto w-full max-w-[280px] rounded-2xl border bg-gradient-to-b from-white to-slate-50 p-4 shadow-sm dark:from-slate-100 dark:to-slate-200">
                  <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Escaneie com o app do seu banco
                  </div>
                  <div className="mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-xl bg-white p-2">
                    <QRCodeSVG
                      value={pixCode}
                      size={220}
                      level="M"
                      marginSize={2}
                      bgColor="#ffffff"
                      fgColor="#0f172a"
                      className="block h-full w-full"
                      title="QR Code para pagamento PIX"
                    />
                  </div>
                  <div className="mt-3 text-center text-xs font-medium text-slate-600">
                    Valor: <span className="font-bold text-slate-900">{formatBRL(pix.amountCents)}</span>
                  </div>
                </div>

                {/* Copy & Paste */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">PIX Copia e Cola</label>
                  <div className="flex items-stretch gap-2 overflow-hidden rounded-xl border bg-muted/40 p-1">
                    <div className="flex flex-1 items-center min-w-0 px-3 py-2">
                      <span className="block w-full font-mono text-[11px] text-muted-foreground truncate">
                        {pixCode}
                      </span>
                    </div>
                    <Button size="sm" onClick={copyCode} className="shrink-0 rounded-lg">
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar
                    </Button>
                  </div>
                </div>

                {/* Steps */}
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Como pagar
                  </div>
                  <ol className="space-y-2 text-xs text-muted-foreground">
                    {[
                      "Abra o app do seu banco",
                      "Escolha pagar via PIX QR Code ou Copia e Cola",
                      `Confirme o valor de ${formatBRL(pix.amountCents)}`,
                      "Sua assinatura é ativada automaticamente",
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Actions */}
                <div className="grid gap-2">
                  <Button onClick={checkNow} disabled={checking} className="w-full">
                    {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Já paguei, verificar agora
                  </Button>
                  <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground hover:text-foreground">
                    Voltar para assinatura
                  </Button>
                </div>

                {/* Trust badge */}
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-success" />
                  Pagamento processado com segurança pelo Mercado Pago
                </div>
              </div>
            )}

            {!loading && (error || (pix?.integrationReady && !pixCode)) && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-destructive">
                <div className="mb-2 font-semibold">Não foi possível gerar o PIX</div>
                {error ?? "O código PIX não foi recebido. Feche esta janela e tente gerar uma nova cobrança."}
                <Button variant="outline" className="mt-4 w-full" onClick={onClose}>Voltar</Button>
              </div>
            )}

            {!loading && pix && !pix.integrationReady && (
              <div className="rounded-xl border border-dashed border-warning/50 bg-warning/5 p-5 text-xs text-muted-foreground space-y-3">
                <div className="flex items-center gap-2 font-semibold text-warning">
                  <Timer className="h-4 w-4" />
                  Mercado Pago não configurado
                </div>
                <p>Adicione o segredo <code className="rounded bg-muted px-1 py-0.5">MERCADOPAGO_ACCESS_TOKEN</code> para gerar QR Codes reais.</p>
                <Button variant="outline" className="w-full" onClick={onClose}>Entendi</Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon: Icon, label, value, highlight, danger }: { icon: any; label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3", danger && "border-destructive/50 bg-destructive/5", highlight && "border-warning/50 bg-warning/5")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
