import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, Clock, CreditCard, QrCode, Zap } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSubscription, planLabel, statusLabel } from "@/hooks/use-subscription";
import { PLANS, formatBRL, type PlanId } from "@/lib/payments";
import { createPixPayment } from "@/lib/mercadopago.functions";
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

      <Dialog open={!!openPlan} onOpenChange={(o) => !o && setOpenPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Pagamento via PIX</DialogTitle>
            <DialogDescription>
              {loading ? "Gerando cobrança..." : pix?.integrationReady
                ? "Escaneie o QR Code abaixo com o app do seu banco."
                : "Estrutura pronta. Configure o Mercado Pago para gerar QR Codes reais."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {loading && <div className="h-40 rounded bg-muted animate-pulse" />}
            {pix && pix.qrCodeBase64 && (
              <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code PIX" className="mx-auto h-48 w-48" />
            )}
            {pix && !pix.integrationReady && (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground space-y-2">
                <p><strong>Próximo passo:</strong> adicionar o secret <code>MERCADOPAGO_ACCESS_TOKEN</code> e ativar a chamada real em <code>src/lib/mercadopago.functions.ts</code>. Um registro de pagamento pendente já foi criado na sua conta.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
