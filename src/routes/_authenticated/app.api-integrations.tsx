import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";
import { AlertTriangle, Braces, Check, Copy, CreditCard, KeyRound, ShieldCheck, Trash2, Webhook, Zap } from "lucide-react";
import { toast } from "sonner";
import { getApiWorkspace, createCommercialApiKey, revokeCommercialApiKey, createApiWebhook, disableApiWebhook } from "@/lib/commercial-api.functions";
import { createPixPayment } from "@/lib/mercadopago.functions";
import { formatBRL } from "@/lib/payments";
import { PixDialog } from "@/components/payments/pix-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ALL = ["servers:read", "monitoring:read", "performance:read", "incidents:read", "analytics:read", "ai:read"] as const;
const planBenefits: Record<string, string[]> = {
  api_pro: ["50 mil requisições/mês", "3 chaves de API", "3 webhooks"],
  api_business: ["250 mil requisições/mês", "10 chaves de API", "10 webhooks"],
  api_ai: ["1 milhão de requisições/mês", "Recursos de IA", "25 webhooks"],
  enterprise: ["5 milhões de requisições/mês", "Limites empresariais", "100 webhooks"],
};

export const Route = createFileRoute("/_authenticated/app/api-integrations")({
  component: ApiWorkspace,
  head: () => ({ meta: [
    { title: "API & Integrações | Stream Monitor" },
    { name: "description", content: "Contrate planos, gerencie chaves, consumo e integrações da STREAM MONITOR API." },
    { property: "og:title", content: "API & Integrações | Stream Monitor" },
    { property: "og:description", content: "Planos, chaves, consumo e integrações da API comercial." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function ApiWorkspace() {
  const qc = useQueryClient();
  const get = useServerFn(getApiWorkspace);
  const create = useServerFn(createCommercialApiKey);
  const revoke = useServerFn(revokeCommercialApiKey);
  const createWebhook = useServerFn(createApiWebhook);
  const disableWebhook = useServerFn(disableApiWebhook);
  const createPix = useServerFn(createPixPayment);
  const [name, setName] = useState("Integração principal");
  const [webhookName, setWebhookName] = useState("Alertas de monitoramento");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [pix, setPix] = useState<Awaited<ReturnType<typeof createPixPayment>> | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["commercial-api-workspace"], queryFn: () => get() });
  const mutation = useMutation({ mutationFn: () => create({ data: { name, scopes: [...ALL] } }), onSuccess: r => { setCreated(r.key); qc.invalidateQueries({ queryKey: ["commercial-api-workspace"] }); }, onError: (e: Error) => toast.error(e.message) });
  const revokeM = useMutation({ mutationFn: (id: string) => revoke({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-api-workspace"] }) });
  const webhookM = useMutation({ mutationFn: () => createWebhook({ data: { name: webhookName, url: webhookUrl, eventTypes: ["server.down", "server.up", "incident.opened", "incident.resolved"] } }), onSuccess: r => { setCreated(r.secret); setWebhookUrl(""); qc.invalidateQueries({ queryKey: ["commercial-api-workspace"] }); }, onError: (e: Error) => toast.error(e.message) });
  const disableWebhookM = useMutation({ mutationFn: (id: string) => disableWebhook({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["commercial-api-workspace"] }) });
  const paymentM = useMutation({
    mutationFn: (code: "api_pro" | "api_business" | "api_ai" | "enterprise") => createPix({ data: { apiPlanCode: code, paymentType: "api_subscription" } }),
    onMutate: code => { setOpenPlan(code); setPix(null); setPaymentError(null); },
    onSuccess: result => setPix(result),
    onError: (error: Error) => setPaymentError(error.message),
  });
  const handlePaid = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["commercial-api-workspace"] });
    await q.refetch();
    setOpenPlan(null);
    setPix(null);
    toast.success("Pagamento confirmado. Sua STREAM MONITOR API já está ativa.");
  }, [qc, q]);

  const d = q.data;
  const plan = Array.isArray(d?.subscription?.api_plans) ? d.subscription.api_plans[0] : d?.subscription?.api_plans;
  const used = (d?.usage ?? []).reduce((sum: number, item: any) => sum + Number(item.request_count), 0);
  const max = Number(d?.subscription?.monthly_limit_override ?? plan?.monthly_request_limit ?? 0);
  const pct = max ? Math.min(100, used / max * 100) : 0;
  const active = d?.subscription?.status === "active" || d?.subscription?.status === "trial";
  const suspendedByMain = d?.subscription?.suspended_reason === "main_subscription_inactive";

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><Badge variant="outline" className="mb-3">Produto independente</Badge><h1 className="text-3xl font-semibold flex items-center gap-2"><Braces className="h-7 w-7 text-primary"/>STREAM MONITOR API</h1><p className="text-muted-foreground mt-1">Contrate via PIX e use seus dados em sistemas, aplicativos, bots e automações.</p></div><a href="/developers"><Button variant="outline">Abrir documentação</Button></a></header>

    {suspendedByMain && <div className="flex gap-3 rounded-md border border-warning/40 bg-warning/10 p-4"><AlertTriangle className="h-5 w-5 shrink-0 text-warning"/><div><p className="font-medium">Sua API foi pausada porque sua assinatura Stream Monitor está inativa.</p><p className="text-sm text-muted-foreground">Ao reativar o plano principal, a API voltará automaticamente se ainda estiver dentro da validade.</p></div></div>}
    {!d?.mainSubscriptionActive && !d?.subscription && <div className="flex gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4"><AlertTriangle className="h-5 w-5 shrink-0 text-destructive"/><div><p className="font-medium">É necessário ter uma assinatura Stream Monitor ativa.</p><p className="text-sm text-muted-foreground">Ative seu plano principal antes de contratar a API.</p></div></div>}

    <section className="space-y-3"><div><h2 className="text-lg font-semibold">Planos da API</h2><p className="text-sm text-muted-foreground">Cobrança mensal separada, com ativação automática após a confirmação do PIX.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(d?.plans ?? []).map((item: any) => <Card key={item.id} className={item.code === "api_ai" ? "border-primary/60" : ""}><CardHeader><div className="flex items-start justify-between gap-2"><CardTitle className="text-base">{item.name}</CardTitle>{item.code === "api_ai" && <Badge>Mais completo</Badge>}</div><div className="text-2xl font-semibold">{formatBRL(Number(item.monthly_price_cents ?? 0))}<span className="text-xs font-normal text-muted-foreground">/mês</span></div></CardHeader><CardContent className="space-y-4"><ul className="space-y-2 text-sm">{(planBenefits[item.code] ?? []).map(benefit => <li key={benefit} className="flex gap-2"><Check className="h-4 w-4 text-success shrink-0"/>{benefit}</li>)}</ul><Button className="w-full" variant={plan?.code === item.code ? "outline" : "default"} disabled={!d?.mainSubscriptionActive || !d?.canPurchase || paymentM.isPending} onClick={() => paymentM.mutate(item.code)}><CreditCard className="h-4 w-4 mr-2"/>{plan?.code === item.code && active ? "Renovar" : "Contratar com PIX"}</Button></CardContent></Card>)}</div></section>

    {d?.pendingPayment && <div className="rounded-md border bg-muted/30 p-4 text-sm"><strong>Pagamento pendente.</strong> Selecione novamente o mesmo plano para reabrir o PIX válido.</div>}

    {d?.subscription && <><div className="grid gap-3 md:grid-cols-5"><Metric icon={Zap} label="Plano" value={plan?.name ?? "—"}/><Metric icon={ShieldCheck} label="Status" value={statusLabel(d.subscription.status)}/><Metric icon={Braces} label="Uso mensal" value={used.toLocaleString("pt-BR")}/><Metric icon={Webhook} label="Limite" value={max.toLocaleString("pt-BR")}/><Metric icon={CreditCard} label="Renovação" value={formatDate(d.subscription.expires_at)}/></div><Card><CardHeader><CardTitle className="text-base">Consumo do mês</CardTitle></CardHeader><CardContent><Progress value={pct}/><div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{used.toLocaleString("pt-BR")} solicitações</span><span>{pct.toFixed(1)}%</span></div></CardContent></Card></>}

    {active && <><section className="space-y-3"><div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Chaves de API</h2><p className="text-sm text-muted-foreground">O segredo completo aparece uma única vez.</p></div><div className="flex gap-2"><Input value={name} onChange={e => setName(e.target.value)} className="w-52"/><Button onClick={() => mutation.mutate()} disabled={mutation.isPending}><KeyRound className="h-4 w-4 mr-2"/>Criar chave</Button></div></div><div className="grid gap-3">{(d?.keys ?? []).map((key: any) => <Card key={key.id}><CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><strong>{key.name}</strong><Badge variant={key.status === "active" ? "default" : "secondary"}>{key.status}</Badge></div><code className="text-xs text-muted-foreground">{key.key_prefix}_••••{key.last_four}</code><div className="flex flex-wrap gap-1 mt-2">{(key.api_key_scopes ?? []).map((scope: any) => <Badge variant="outline" key={scope.scope}>{scope.scope}</Badge>)}</div></div>{key.status === "active" && <Button size="icon" variant="ghost" aria-label="Revogar chave" onClick={() => revokeM.mutate(key.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>}</CardContent></Card>)}</div></section><section className="space-y-3"><div><h2 className="text-lg font-semibold">Webhooks</h2><p className="text-sm text-muted-foreground">Receba eventos assinados de indisponibilidade e recuperação.</p></div><div className="flex flex-col md:flex-row gap-2"><Input value={webhookName} onChange={e => setWebhookName(e.target.value)} placeholder="Nome"/><Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://seu-sistema.com/webhook"/><Button disabled={!webhookUrl || webhookM.isPending} onClick={() => webhookM.mutate()}><Webhook className="h-4 w-4 mr-2"/>Adicionar</Button></div><div className="grid gap-3">{(d?.webhooks ?? []).map((webhook: any) => <Card key={webhook.id}><CardContent className="p-4 flex items-center justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><strong>{webhook.name}</strong><Badge variant={webhook.status === "active" ? "default" : "secondary"}>{webhook.status}</Badge></div><p className="text-xs text-muted-foreground truncate">{webhook.url}</p><p className="text-xs text-muted-foreground mt-1">Assinatura ••••{webhook.secret_last_four}</p></div>{webhook.status === "active" && <Button size="icon" variant="ghost" aria-label="Desativar webhook" onClick={() => disableWebhookM.mutate(webhook.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>}</CardContent></Card>)}</div></section><section><h2 className="text-lg font-semibold mb-3">Atividade recente</h2><Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="p-3 text-left">Método</th><th className="p-3 text-left">Endpoint</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Duração</th></tr></thead><tbody>{(d?.logs ?? []).map((log: any) => <tr key={log.request_id} className="border-t"><td className="p-3 font-mono">{log.method}</td><td className="p-3 font-mono text-xs">{log.endpoint}</td><td className="p-3">{log.status_code}</td><td className="p-3">{log.duration_ms} ms</td></tr>)}</tbody></table></div></Card></section></>}

    <PixDialog openPlan={openPlan} onClose={() => { setOpenPlan(null); setPix(null); setPaymentError(null); }} pix={pix} loading={paymentM.isPending} error={paymentError} onPaid={handlePaid}/>
    <Dialog open={Boolean(created)} onOpenChange={open => !open && setCreated(null)}><DialogContent><DialogHeader><DialogTitle>Segredo criado</DialogTitle><DialogDescription>Copie agora. Por segurança, ele não poderá ser exibido novamente.</DialogDescription></DialogHeader><div className="rounded-md border bg-muted p-3 font-mono text-xs break-all">{created}</div><Button onClick={async () => { if (created) { await navigator.clipboard.writeText(created); toast.success("Segredo copiado"); } }}><Copy className="h-4 w-4 mr-2"/>Copiar segredo</Button></DialogContent></Dialog>
  </div>;
}

function statusLabel(status: string) { return ({ active: "Ativa", trial: "Teste", suspended: "Pausada", expired: "Expirada", cancelled: "Cancelada", pending: "Pendente" } as Record<string, string>)[status] ?? status; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString("pt-BR") : "—"; }
function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) { return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-primary"/><p className="text-xs text-muted-foreground mt-3">{label}</p><p className="text-lg font-semibold mt-1">{value}</p></CardContent></Card>; }