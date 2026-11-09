import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Gift, Copy, Share2, Users, Wallet, CheckCircle2, Clock3, TrendingUp, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getReferralDashboard } from "@/lib/referral-program.functions";
import { formatBRL } from "@/lib/payments";

export const Route = createFileRoute("/_authenticated/app/indique")({
  head: () => ({ meta: [{ title: "Indique e Ganhe — Stream Monitor" }, { name: "robots", content: "noindex" }] }),
  component: ReferralPage,
});

function ReferralPage() {
  const getDashboard = useServerFn(getReferralDashboard);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recurring-referral-program"],
    queryFn: () => getDashboard(),
    staleTime: 30_000,
  });
  const [copied, setCopied] = useState(false);
  const link = useMemo(() => data?.referralCode
    ? `https://streammonitor.site/auth?ref=${encodeURIComponent(data.referralCode)}`
    : "", [data?.referralCode]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link de indicação copiado!");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link para copiar manualmente.");
    }
  }
  function shareLink() {
    if (!link) return;
    const message = `Conheça o Stream Monitor! Acompanhe seus servidores, receba alertas e use meu convite: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }
  const wallet = data?.wallet;
  const metrics = [
    { icon: Wallet, label: "Saldo para sua próxima fatura", value: formatBRL(wallet?.availableCents ?? 0), description: "Descontado automaticamente no Pix", emphasis: true },
    { icon: TrendingUp, label: "Total de comissões", value: formatBRL(wallet?.earnedCents ?? 0), description: "30% de cada pagamento confirmado" },
    { icon: Users, label: "Clientes indicados", value: String(data?.totalIndicated ?? 0), description: `${data?.convertedIndicated ?? 0} já assinaram` },
    { icon: Clock3, label: "Em cobrança pendente", value: formatBRL(wallet?.reservedCents ?? 0), description: "Reserva liberada se o Pix expirar" },
  ];

  return <div className="sm-page space-y-6 w-full max-w-6xl">
    <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6 text-white sm:p-9">
      <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-200"><Gift className="h-4 w-4" /> Programa de indicação</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Indique e ganhe <span className="text-sky-300">30% para sempre</span></h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300">Compartilhe seu link. Quando um indicado pagar ou renovar sua assinatura, você recebe 30% do valor pago como crédito para abater suas próximas faturas.</p>
        </div>
        <div className="shrink-0 rounded-2xl border border-sky-300/20 bg-white/10 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-wider text-sky-200">Seu saldo disponível</p>
          <p className="mt-1 text-3xl font-bold">{formatBRL(wallet?.availableCents ?? 0)}</p>
          <p className="mt-1 text-xs text-slate-300">Acumula e não expira por mês</p>
        </div>
      </div>
    </section>

    {isLoading && <p className="text-sm text-muted-foreground">Carregando suas indicações...</p>}
    {error && <Card className="p-5"><p className="text-sm text-destructive">Não foi possível carregar seu saldo agora.</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>Tentar novamente</Button></Card>}

    {data && <>
      <Card className="p-5 sm:p-7 space-y-4">
        <div><h2 className="text-lg font-semibold">Seu link exclusivo</h2><p className="mt-1 text-sm text-muted-foreground">Envie para amigos, clientes e revendedores. O vínculo acontece no cadastro.</p></div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input aria-label="Seu link de indicação" className="min-w-0 flex-1 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm outline-none" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={copyLink} disabled={!link} className="gap-2"><Copy className="h-4 w-4" />{copied ? "Copiado!" : "Copiar link"}</Button>
          <Button onClick={shareLink} disabled={!link} variant="outline" className="gap-2"><Share2 className="h-4 w-4" />Compartilhar</Button>
        </div>
        <p className="text-xs text-muted-foreground">Seu código: <strong>{data.referralCode || "Indisponível"}</strong>. Não existe pagamento em dinheiro: os ganhos viram desconto na renovação da sua assinatura.</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <Card key={metric.label} className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><metric.icon className="h-4 w-4 text-sky-500" />{metric.label}</div>
          <div className="mt-3 text-2xl font-bold tracking-tight">{metric.value}</div>
          <p className="mt-1 text-xs text-muted-foreground">{metric.description}</p>
        </Card>)}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Suas indicações</h2>
          <p className="mt-1 text-xs text-muted-foreground">O crédito é liberado após o pagamento confirmado do indicado.</p>
          <div className="mt-4 space-y-3">
            {data.referrals.length === 0 && <p className="rounded-xl bg-muted/40 p-5 text-center text-sm text-muted-foreground">Ainda não há indicações. Compartilhe seu link para começar.</p>}
            {data.referrals.map((referral: { label: string; joinedAt: string; active: boolean; earnedCents: number }, i: number) => <div key={i} className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
              <div><p className="text-sm font-medium">{referral.label}</p><p className="text-xs text-muted-foreground">{new Date(referral.joinedAt).toLocaleDateString("pt-BR")}</p></div>
              <div className="text-right"><Badge variant={referral.active ? "default" : "secondary"}>{referral.active ? "Assinou" : "Aguardando pagamento"}</Badge><p className="mt-1 text-sm font-semibold">{formatBRL(referral.earnedCents)}</p></div>
            </div>)}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Últimos créditos recebidos</h2>
          <p className="mt-1 text-xs text-muted-foreground">Toda renovação paga pelo indicado gera uma nova comissão.</p>
          <div className="mt-4 space-y-3">
            {data.recentRewards.length === 0 && <p className="rounded-xl bg-muted/40 p-5 text-center text-sm text-muted-foreground">Seus créditos aparecerão aqui após o primeiro pagamento aprovado.</p>}
            {data.recentRewards.map((reward: { paidAmountCents: number; rewardCents: number; createdAt: string }, i: number) => <div key={i} className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0">
              <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><div><p className="text-sm font-medium">Pagamento de {formatBRL(reward.paidAmountCents)}</p><p className="text-xs text-muted-foreground">{new Date(reward.createdAt).toLocaleDateString("pt-BR")}</p></div></div>
              <p className="font-semibold text-emerald-500">+ {formatBRL(reward.rewardCents)}</p>
            </div>)}
          </div>
        </Card>
      </div>

      <Card className="p-5 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold">Como funciona</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-muted/40 p-4"><p className="font-semibold">1. Convide</p><p className="mt-1 text-sm text-muted-foreground">Envie seu link exclusivo. O amigo precisa criar uma conta nova por ele.</p></div>
          <div className="rounded-xl bg-muted/40 p-4"><p className="font-semibold">2. Ganhe a cada pagamento</p><p className="mt-1 text-sm text-muted-foreground">Receba 30% do valor de cada assinatura aprovada, inclusive renovações futuras.</p></div>
          <div className="rounded-xl bg-muted/40 p-4"><p className="font-semibold">3. Abata na fatura</p><p className="mt-1 text-sm text-muted-foreground">Seu crédito é aplicado automaticamente na próxima renovação por Pix. O restante continua acumulado.</p></div>
        </div>
        <p className="text-xs text-muted-foreground">Válido para pagamentos de assinatura do Stream Monitor. Não inclui pacotes de créditos, API ou loja. Pagamentos estornados são desconsiderados. Sem indicação própria e sem saque em dinheiro.</p>
        <a href="/app/subscription" className="inline-flex items-center gap-2 text-sm font-medium text-sky-500 hover:underline">Ver minha assinatura <ExternalLink className="h-4 w-4" /></a>
      </Card>
    </>}
  </div>;
}
