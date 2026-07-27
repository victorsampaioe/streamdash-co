import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock, Copy, CreditCard, Loader2, QrCode, ShieldCheck, Sparkles, Timer, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
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
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const { data, isLoading, refetch } = useSubscription();
  const [openPlan, setOpenPlan] = useState<PlanId | null>(null);
  const [pix, setPix] = useState<Awaited<ReturnType<typeof createPixPayment>> | null>(null);
  const [loading, setLoading] = useState(false);
  const createPix = useServerFn(createPixPayment);

  const sub = data?.subscription;

  const handlePaid = useCallback(async () => {
    await refetch();
    toast.success("Pagamento confirmado! Assinatura ativada e recursos liberados.");
    setOpenPlan(null);
    setPix(null);
  }, [refetch]);

  async function handleRenew(plan: PlanId) {
    setOpenPlan(plan);
    setLoading(true);
    setPix(null);
    try {
      const res = await createPix({ data: { plan } });
      setPix(res);
      if (!res.integrationReady) {
        toast.info("Estrutura de pagamento pronta. Configure o Mercado Pago para gerar o QR Code PIX.");
      }
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar pagamento");
      setOpenPlan(null);
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
        onClose={() => { setOpenPlan(null); setPix(null); }}
        pix={pix}
        loading={loading}
        onPaid={handlePaid}
      />
    </div>
  );
}

function PixDialog({ openPlan, onClose, pix, loading, onPaid }: {
  openPlan: PlanId | null;
  onClose: () => void;
  pix: Awaited<ReturnType<typeof createPixPayment>> | null;
  loading: boolean;
  onPaid: () => Promise<void>;
}) {
  const getStatus = useServerFn(getPaymentStatus);
  const [remaining, setRemaining] = useState<number>(0);
  const [checking, setChecking] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    setQrImage(null);
    if (!pix?.copyPaste) return;
    // Generate from the official PIX payload in the browser. Some provider
    // base64 images are oversized or malformed even though the payload is valid.
    QRCode.toDataURL(pix.copyPaste, { width: 360, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => { if (!cancelled) setQrImage(url); })
      .catch(() => { if (!cancelled) setQrImage(null); });
    return () => { cancelled = true; };
  }, [pix?.copyPaste]);

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
    if (!pix?.copyPaste) return;
    navigator.clipboard.writeText(pix.copyPaste);
    toast.success("Código PIX copiado!");
  }

  return (
    <Dialog open={!!openPlan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header gradient */}
        <div className="relative bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border-b p-6">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base">Pagamento via PIX</DialogTitle>
                <DialogDescription className="text-xs">
                  Aprovação automática · Ativa na hora
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {pix && (
            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <div className="text-3xl font-bold tracking-tight">{formatBRL(pix.amountCents)}</div>
                {pix.discountApplied && (
                  <div className="flex items-center gap-1 text-xs text-success mt-1">
                    <Sparkles className="h-3 w-3" /> Desconto de indicação aplicado
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Expira em</div>
                <div className={cn("font-mono font-semibold tabular-nums", remaining < 60 && "text-destructive")}>
                  <Timer className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                  {mm}:{ss}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          {loading && (
            <div className="space-y-3">
              <div className="mx-auto h-56 w-56 rounded-xl bg-muted animate-pulse" />
              <p className="text-center text-sm text-muted-foreground">Gerando cobrança PIX...</p>
            </div>
          )}

          {!loading && pix?.integrationReady && pix.copyPaste && (
            <>
              <div className="mx-auto w-fit rounded-xl border-2 border-primary/20 bg-white p-3 shadow-lg">
                {qrImage ? (
                  <img
                    src={qrImage}
                    alt="QR Code PIX para pagamento da assinatura"
                    className="h-56 w-56 block"
                    onError={() => {
                      QRCode.toDataURL(pix.copyPaste ?? "", { width: 360, margin: 1, errorCorrectionLevel: "M" })
                        .then(setQrImage)
                        .catch(() => setQrImage(null));
                    }}
                  />
                ) : (
                  <div className="h-56 w-56 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">PIX Copia e Cola</label>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] truncate">
                    {pix.copyPaste}
                  </div>
                  <Button size="sm" variant="secondary" onClick={copyCode}>
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
                <div className="font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Como pagar</div>
                <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                  <li>Abra o app do seu banco</li>
                  <li>Escolha pagar via PIX QR Code ou Copia e Cola</li>
                  <li>Confirme o valor de <strong>{formatBRL(pix.amountCents)}</strong></li>
                  <li>Sua assinatura é ativada automaticamente</li>
                </ol>
              </div>

              <Button variant="outline" className="w-full" onClick={checkNow} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Já paguei, verificar agora
              </Button>
            </>
          )}

          {!loading && pix?.integrationReady && !pix.copyPaste && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível montar o QR Code. Feche esta janela e tente gerar o PIX novamente.
            </div>
          )}

          {!loading && pix && !pix.integrationReady && (
            <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-warning">Mercado Pago não configurado</p>
              <p>Adicione o segredo <code className="rounded bg-muted px-1">MERCADOPAGO_ACCESS_TOKEN</code> para gerar QR Codes reais.</p>
            </div>
          )}
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
