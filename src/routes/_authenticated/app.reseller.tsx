import { createFileRoute } from "@tanstack/react-router";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Users, 
  Wallet, 
  ShoppingBag, 
  Plus, 
  History, 
  TrendingUp, 
  ChevronRight,
  Package,
  CreditCard,
  Settings,
  Trash2,
  Edit2,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  getResellerNetwork, 
  getCreditHistory, 
  getResellerStats,
  getResellerPlans,
  saveResellerPlan,
  deleteResellerPlan
} from "@/lib/reseller.functions";
import { formatBRL, type PlanId } from "@/lib/payments";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { PixDialog } from "@/components/payments/pix-dialog";
import { createPixPayment } from "@/lib/mercadopago.functions";
import { CreateResellerDialog } from "@/components/reseller/create-reseller-dialog";
import { useSubscription } from "@/hooks/use-subscription";

export const Route = createFileRoute("/_authenticated/app/reseller")({
  head: () => ({
    meta: [
      { title: "Painel do Revendedor — StreamMonitor" },
      { name: "description", content: "Gerencie sua rede, compre créditos e crie sub-revendedores." },
    ],
  }),
  component: ResellerDashboard,
});

const CREDIT_PACKS = [
  { amount: 10, price: 12000, plan: "credits_10" as PlanId, label: "10 créditos" },
  { amount: 30, price: 30000, plan: "credits_30" as PlanId, label: "30 créditos" },
  { amount: 50, price: 40000, plan: "credits_50" as PlanId, label: "50 créditos" },
];

function ResellerDashboard() {
  const qc = useQueryClient();
  const getStats = useServerFn(getResellerStats);
  const getNetwork = useServerFn(getResellerNetwork);
  const getHistory = useServerFn(getCreditHistory);
  const createPix = useServerFn(createPixPayment);
  const getPlans = useServerFn(getResellerPlans);
  const savePlan = useServerFn(saveResellerPlan);
  const deletePlan = useServerFn(deleteResellerPlan);

  const { data: stats } = useQuery({ queryKey: ["reseller-stats"], queryFn: () => getStats() });
  const { data: network } = useQuery({ queryKey: ["reseller-network"], queryFn: () => getNetwork() });
  const { data: history } = useQuery({ queryKey: ["reseller-history"], queryFn: () => getHistory() });
  const { data: plans } = useQuery({ queryKey: ["reseller-plans"], queryFn: () => getPlans() });
  const { data: subData } = useSubscription();

  const isAccountActive = subData?.isActive && !subData?.isTrial && !subData?.isExpired;

  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [resellerDialogOpen, setResellerDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [activePurchasePlan, setActivePurchasePlan] = useState<PlanId | null>(null);
  const [pix, setPix] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState({ name: "", price: "", duration_days: "30" });

  const saveMutation = useMutation({
    mutationFn: (data: { id?: string; plan: any }) => savePlan({ data }),
    onSuccess: () => {
      toast.success("Plano salvo!");
      setPlanDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["reseller-plans"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlan({ data: { id } }),
    onSuccess: () => {
      toast.success("Plano excluído!");
      qc.invalidateQueries({ queryKey: ["reseller-plans"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const handleEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({ 
      name: plan.name, 
      price: (plan.price_cents / 100).toString(), 
      duration_days: plan.duration_days.toString() 
    });
    setPlanDialogOpen(true);
  };

  const handleCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm({ name: "", price: "", duration_days: "30" });
    setPlanDialogOpen(true);
  };

  const handleSavePlan = () => {
    saveMutation.mutate({
      id: editingPlan?.id,
      plan: {
        name: planForm.name,
        price: parseFloat(planForm.price),
        duration_days: parseInt(planForm.duration_days),
        features: []
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Painel do Revendedor</h1>
          <p className="text-muted-foreground text-sm">Gerencie seus créditos, rede e clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setBuyDialogOpen(true)} className="bg-primary hover:bg-primary/90">
            <ShoppingBag className="h-4 w-4 mr-2" /> Comprar Créditos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Créditos Disponíveis
              <Wallet className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.credits ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">1 crédito = 1 novo revendedor</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Minha Rede (Ativos)
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.activeClients ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total de revendedores e clientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Receita Total
              <TrendingUp className="h-4 w-4 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBRL(stats?.revenue ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total acumulado em vendas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rede" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="rede">Minha Rede</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="planos">Meus Planos</TabsTrigger>
        </TabsList>

        <TabsContent value="rede" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Membros da Rede</CardTitle>
                <CardDescription>Revendedores que você criou.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setResellerDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Criar Revendedor
              </Button>
            </CardHeader>
            <CardContent>
              {(!network || network.length === 0) ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">Sua rede ainda está vazia.</p>
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  {network.map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {user.full_name?.[0] || "?"}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{user.full_name || "Usuário sem nome"}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                          <div className="text-xs text-muted-foreground">Créditos</div>
                          <div className="font-semibold text-sm">{user.credits}</div>
                        </div>
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">Ativo</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Créditos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!history || history.length === 0) ? (
                <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
              ) : (
                <div className="space-y-4">
                  {history.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <div className="text-sm font-medium">{item.description || "Movimentação de crédito"}</div>
                        <div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString("pt-BR")}</div>
                      </div>
                      <div className={cn(
                        "font-bold text-sm",
                        item.amount > 0 ? "text-success" : "text-destructive"
                      )}>
                        {item.amount > 0 ? `+${item.amount}` : item.amount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planos" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Configuração de Planos</CardTitle>
                <CardDescription>Defina os valores que seus clientes verão em seus painéis.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={handleCreatePlan}>
                <Plus className="h-4 w-4 mr-2" /> Novo Plano
              </Button>
            </CardHeader>
            <CardContent>
              {(!plans || plans.length === 0) ? (
                <div className="bg-muted/30 border border-dashed rounded-lg p-8 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum plano configurado. Crie seu primeiro plano para seus clientes.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                  {plans.map((plan: any) => (
                    <Card key={plan.id} className="border-2 border-muted hover:border-primary/30 transition-all">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{plan.name}</CardTitle>
                        <div className="text-2xl font-bold">{formatBRL(plan.price_cents)}</div>
                        <Badge variant="secondary">{plan.duration_days} dias</Badge>
                      </CardHeader>
                      <CardFooter className="flex gap-2 pt-4">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEditPlan(plan)}>
                          <Edit2 className="h-4 w-4 mr-2" /> Editar
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(plan.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden border-0 bg-transparent shadow-2xl">
          <PixDialog
            openPlan={activePurchasePlan}
            onClose={() => { setActivePurchasePlan(null); setPix(null); setBuyDialogOpen(false); }}
            pix={pix}
            loading={loading}
            error={null}
            onPaid={async () => {
              toast.success("Créditos adicionados com sucesso!");
              qc.invalidateQueries({ queryKey: ["reseller-stats"] });
              qc.invalidateQueries({ queryKey: ["reseller-history"] });
              setActivePurchasePlan(null);
              setBuyDialogOpen(false);
            }}
          />
          {!activePurchasePlan && (
            <Card className="border shadow-none">
              <CardHeader>
                <DialogTitle>Comprar Créditos</DialogTitle>
                <DialogDescription>
                  Cada crédito permite que você crie 1 novo revendedor em sua rede.
                </DialogDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isAccountActive ? (
                  <div className="bg-success/10 border border-success/20 p-3 rounded-lg flex items-center gap-2 text-success text-sm mb-4">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>✅ Conta ativa - Você pode comprar créditos e criar sua rede</span>
                  </div>
                ) : (
                  <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-destructive font-semibold">
                      <AlertCircle className="h-5 w-5" />
                      <span>⚠️ Sua conta precisa estar ativa para comprar créditos.</span>
                    </div>
                    <p className="text-sm text-muted-foreground ml-7">
                      Assine um plano para liberar essa função.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {CREDIT_PACKS.map((pack) => (
                    <Button
                      key={pack.amount}
                      variant="outline"
                      className="h-auto py-4 flex flex-col gap-1 border-2 hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleBuyCredits(pack)}
                      disabled={!isAccountActive}
                    >
                      <div className="font-bold text-lg">{pack.amount} Créditos</div>
                      <div className="text-primary font-semibold">{formatBRL(pack.price)}</div>
                    </Button>
                  ))}
                </div>
                <div className="bg-muted p-4 rounded-lg flex gap-3 items-start">
                  <div className="bg-primary/20 p-2 rounded-full shrink-0">
                    <CreditCard className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Pagamento via <strong>PIX</strong> com ativação automática após a confirmação.
                    O fluxo é o mesmo dos planos de assinatura.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Editar Plano" : "Novo Plano"}</DialogTitle>
            <DialogDescription>
              Configure o nome, preço e duração do plano para seus clientes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Plano</Label>
              <Input 
                value={planForm.name} 
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} 
                placeholder="Ex: Plano Mensal" 
              />
            </div>
            <div className="space-y-2">
              <Label>Preço (BRL)</Label>
              <Input 
                type="number"
                value={planForm.price} 
                onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} 
                placeholder="Ex: 35.00" 
              />
            </div>
            <div className="space-y-2">
              <Label>Duração (Dias)</Label>
              <Input 
                type="number"
                value={planForm.duration_days} 
                onChange={(e) => setPlanForm({ ...planForm, duration_days: e.target.value })} 
                placeholder="Ex: 30" 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePlan} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar Plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateResellerDialog
        open={resellerDialogOpen}
        onOpenChange={setResellerDialogOpen}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["reseller-stats"] });
          qc.invalidateQueries({ queryKey: ["reseller-network"] });
        }}
      />
    </div>
  );

  async function handleBuyCredits(pack: typeof CREDIT_PACKS[0]) {
    setActivePurchasePlan(pack.plan);
    setLoading(true);
    setPix(null);
    try {
      const res = await createPix({ data: { plan: pack.plan } });
      setPix(res);
      qc.invalidateQueries({ queryKey: ["reseller-stats"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar pagamento");
      setActivePurchasePlan(null);
    } finally {
      setLoading(false);
    }
  }
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
