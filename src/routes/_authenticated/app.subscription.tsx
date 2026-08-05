import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, CheckCircle2, Clock, CreditCard, Zap, Package, Rocket, Coins, MessageCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSubscription, planLabel, statusLabel } from "@/hooks/use-subscription";
import { PLANS, CREDIT_PACKS, formatBRL, effectivePriceCents, isYearlyPromoActive, isMonthlyPromoActive, type PlanId } from "@/lib/payments";
import { createPixPayment } from "@/lib/mercadopago.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PixDialog } from "@/components/payments/pix-dialog";
import { getParentResellerPlans } from "@/lib/reseller.functions";
import { useQuery } from "@tanstack/react-query";

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
  const navigate = useNavigate();

  // Resellers are allowed to see this page to buy more credits, but it will be filtered below
  const isReseller = data?.profile?.is_reseller;
  const [openPlan, setOpenPlan] = useState<PlanId | null>(null);
  const [pix, setPix] = useState<any>(null);
  const getParentPlans = useServerFn(getParentResellerPlans);
  const { data: parentPlans } = useQuery({ 
    queryKey: ["parent-plans", data?.parentId || data?.ownerId || "admin"], 
    queryFn: () => getParentPlans(),
    enabled: !!data
  });

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const createPix = useServerFn(createPixPayment);

  const sub = data?.subscription;
  const parentPlansData = parentPlans?.plans || [];
  const parentProfileData = parentPlans?.parent || null;

  const clientPlans = parentPlansData.filter((p) => (p.kind ?? "plan") === "plan");
  const creditPlans = parentPlansData.filter((p) => p.kind === "credits");

  const openParentWhatsapp = useCallback((message: string) => {
    const phone = (parentProfileData?.whatsapp || parentProfileData?.phone || "").replace(/\D/g, "");
    if (!phone) {
      toast.error("Seu revendedor ainda não cadastrou um WhatsApp de contato.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  }, [parentProfileData]);


  const handlePaid = useCallback(async () => {
    await refetch();
    toast.success("Pagamento confirmado! Saldo atualizado e recursos liberados.");
    setOpenPlan(null);
    setPix(null);
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
                {isReseller ? (
                  <Rocket className="h-5 w-5 text-purple-500" />
                ) : (
                  <Zap className="h-5 w-5 text-primary" />
                )}
                <h2 className="text-lg font-semibold">
                  {isReseller ? "Conta de Revendedor" : sub ? `Plano ${planLabel(sub.plan)}` : "Plano —"}
                </h2>
                {isReseller ? (
                  <Badge className="bg-purple-500 hover:bg-purple-600">Revendedor Ativo</Badge>
                ) : sub && (
                  <Badge variant={data?.isExpired ? "destructive" : data?.isExpiringSoon ? "outline" : "default"}>
                    {statusLabel(sub.status)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                {isReseller ? (
                  <>
                    <Metric icon={Coins} label="Créditos disponíveis" value={`${data?.profile?.credits ?? 0} crédito(s)`} highlight={(data?.profile?.credits ?? 0) === 0} danger={(data?.profile?.credits ?? 0) < 0} />
                    <Metric icon={CheckCircle2} label="Tipo de conta" value="Revendedor" />
                    <Metric icon={Clock} label="Status operacional" value={(data?.profile?.credits ?? 0) > 0 ? "Ativo" : "Pausado (Sem créditos)"} danger={(data?.profile?.credits ?? 0) === 0} />
                  </>
                ) : (
                  <>
                    <Metric icon={Clock} label="Dias restantes" value={sub ? `${data?.daysRemaining ?? 0} dia(s)` : "—"} highlight={data?.isExpiringSoon} danger={data?.isExpired} />
                    <Metric icon={CalendarDays} label="Vencimento" value={sub ? new Date(sub.expires_at).toLocaleDateString("pt-BR") : "—"} />
                    <Metric icon={CheckCircle2} label="Cadastrado em" value={sub ? new Date(sub.started_at).toLocaleDateString("pt-BR") : "—"} />
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {!isReseller && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            {data?.isExpired ? "Renovar Assinatura" : "Fazer upgrade"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!data?.parentId && !isReseller ? PLANS.map((plan) => {
            const isPromo = plan.id === "monthly" ? isMonthlyPromoActive() : plan.id === "yearly" ? isYearlyPromoActive() : false;
            const promoLabel = plan.id === "monthly" ? "🔥 Só hoje" : "🔥 Só hoje";
            const price = effectivePriceCents(plan);
            return (
            <Card key={plan.id} className={cn("p-6 relative", plan.highlight && !isPromo && "border-primary/60 ring-1 ring-primary/30", isPromo && "border-warning/60 ring-1 ring-warning/30")}>
              {isPromo ? (
                <Badge className="absolute -top-2 right-4 bg-warning text-warning-foreground">{promoLabel}</Badge>
              ) : plan.highlight ? (
                <Badge className="absolute -top-2 right-4">Mais popular</Badge>
              ) : null}
              <div className="space-y-3">
                <h3 className="font-semibold">{plan.name}</h3>
                <div className="text-3xl font-bold">
                  {isPromo && <span className="text-base font-normal text-muted-foreground line-through mr-2">{formatBRL(plan.priceCents)}</span>}
                  {formatBRL(price)}
                  <span className="text-sm text-muted-foreground font-normal"> /{plan.id === "monthly" ? "mês" : "ano"}</span>
                </div>
                {isPromo && (
                  <p className="text-xs text-warning font-medium">Promoção válida só hoje — amanhã volta para {formatBRL(plan.priceCents)}.</p>
                )}
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
            );
          }) : data?.parentId ? (
            <div className="md:col-span-2 p-12 text-center border border-dashed rounded-xl">
               <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold">Planos do seu Revendedor</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  {clientPlans.length === 0
                    ? "Você faz parte de uma rede privada, mas seu revendedor ainda não configurou planos. Fale com ele pelo WhatsApp para contratar ou renovar."
                    : "Escolha um dos planos abaixo configurados pelo seu revendedor. A negociação é feita diretamente com ele pelo WhatsApp."}
                </p>
                {clientPlans.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    {clientPlans.map((plan: any) => (
                      <Card key={plan.id} className="p-6 relative border-2 border-muted hover:border-primary/30 transition-all">
                        <div className="space-y-3">
                          <h3 className="font-semibold">{plan.name}</h3>
                          <div className="text-3xl font-bold">
                            {formatBRL(plan.price_cents)}
                            <span className="text-sm text-muted-foreground font-normal"> / {plan.duration_days} dias</span>
                          </div>
                          <Button 
                            className="w-full" 
                            variant="outline" 
                            onClick={() => openParentWhatsapp(`Olá, gostaria de contratar/renovar o plano "${plan.name}" (${plan.duration_days} dias) no valor de ${formatBRL(plan.price_cents)}.`)}
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Contratar via WhatsApp
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Button onClick={() => openParentWhatsapp("Olá, gostaria de contratar/renovar meu acesso ao StreamMonitor.")}>
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Falar com meu revendedor
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Reseller inside a tree: buys credits from the parent reseller via WhatsApp (never Admin PIX) */}
      {isReseller && data?.parentId && (
        <div className="pt-4">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">Comprar créditos com seu revendedor</h2>
          </div>
          {creditPlans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {creditPlans.map((pack: any) => (
                <Card key={pack.id} className="p-6 border-2 border-muted hover:border-purple-300 transition-colors">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-xl">{pack.name}</h3>
                      <div className="text-3xl font-extrabold mt-1">{formatBRL(pack.price_cents)}</div>
                      <p className="text-xs text-muted-foreground mt-1">{pack.credits_amount ?? 0} crédito(s)</p>
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={() => openParentWhatsapp(`Olá, gostaria de comprar o pacote "${pack.name}" (${pack.credits_amount ?? 0} créditos) no valor de ${formatBRL(pack.price_cents)}.`)}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Comprar via WhatsApp
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center border-dashed">
              <p className="text-sm text-muted-foreground mb-4">
                Seu revendedor ainda não configurou pacotes de créditos. Fale com ele pelo WhatsApp para recarregar seu saldo.
              </p>
              <Button onClick={() => openParentWhatsapp("Olá, gostaria de comprar créditos para minha revenda.")}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Falar com meu revendedor
              </Button>
            </Card>
          )}
        </div>
      )}


      {/* Credit Packs (Admin PIX) — exclusive to resellers with no parent reseller */}
      {isReseller && !data?.parentId && (
        <div className="pt-4">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">🚀 Comprar mais créditos</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CREDIT_PACKS.map((pack) => (
              <Card key={pack.id} className={cn("p-6 relative border-2", pack.highlight ? "border-purple-500 ring-1 ring-purple-200" : "border-muted hover:border-purple-300 transition-colors")}>
                {pack.highlight && (
                  <Badge className="absolute -top-2 right-4 bg-purple-500">Melhor oferta</Badge>
                )}
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-xl">{pack.name}</h3>
                    <div className="text-3xl font-extrabold mt-1">
                      {formatBRL(pack.priceCents)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Pagamento único via PIX</p>
                  </div>
                  
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {pack.perks.map((p) => (
                      <li key={p} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-purple-500" />
                        {p}
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className={cn("w-full gap-2", pack.highlight ? "bg-purple-600 hover:bg-purple-700" : "")} 
                    onClick={() => handleRenew(pack.id)}
                    disabled={loading}
                  >
                    <CreditCard className="h-4 w-4" />
                    Comprar com PIX
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}


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

function Metric({ icon: Icon, label, value, highlight, danger }: { icon: any; label: string; value: string; highlight?: boolean; danger?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3", danger && "border-destructive/50 bg-destructive/5", highlight && "border-warning/50 bg-warning/5")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
