import { QrCode, X, Sparkles, Timer, Copy, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatBRL, type PlanId } from "@/lib/payments";
import { createPixPayment, getPaymentStatus } from "@/lib/mercadopago.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PixDialogProps {
  openPlan: string | null;
  onClose: () => void;
  pix: Awaited<ReturnType<typeof createPixPayment>> | null;
  loading: boolean;
  error: string | null;
  onPaid: () => Promise<void>;
}

export function PixDialog({ openPlan, onClose, pix, loading, error, onPaid }: PixDialogProps) {
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

  // Confirm directly with Mercado Pago every 3s.
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

                {/* Success Message for Approved */}
                {pix.status === "approved" ? (
                  <div className="space-y-4 animate-in zoom-in duration-300">
                    <div className="rounded-xl bg-success/10 border border-success/20 p-5 text-center space-y-3">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
                        <ShieldCheck className="h-6 w-6 text-success" />
                      </div>
                      <h3 className="text-lg font-bold text-success">✅ Pagamento confirmado com sucesso!</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Seu pagamento foi aprovado. Para receber o acesso ao produto comprado, entre em contato com nosso suporte no Telegram:
                      </p>
                      <div className="font-bold text-primary text-base">📲 @StreamMonitorOfc</div>
                    </div>
                    <Button asChild className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 transition-all">
                      <a href="https://t.me/StreamMonitorOfc" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2">
                        Entrar em contato pelo Telegram
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Button onClick={checkNow} disabled={checking} className="w-full">
                      {checking ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Já paguei, verificar agora
                    </Button>
                    <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground hover:text-foreground">
                      Voltar
                    </Button>
                  </div>
                )}


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
                  Pagamento indisponível no momento
                </div>
                <p>Não foi possível gerar o QR Code agora. Tente novamente em instantes ou fale com o suporte.</p>
                <Button variant="outline" className="w-full" onClick={onClose}>Entendi</Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
