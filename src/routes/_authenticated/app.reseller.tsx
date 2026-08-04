import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  getResellerNetwork, 
  getCreditHistory, 
  getResellerStats,
  getResellerPlans,
  saveResellerPlan,
  deleteResellerPlan,
  transferCredits,
} from "@/lib/reseller.functions";
import { 
  getClientDetails, 
  updateResellerClient, 
  deleteResellerClient 
} from "@/lib/reseller-manage.functions";
import { formatBRL, type PlanId } from "@/lib/payments";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger
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
  { amount: 10, price: 10000, plan: "credits_10" as PlanId, label: "10 créditos" },
  { amount: 30, price: 27000, plan: "credits_30" as PlanId, label: "30 créditos" },
  { amount: 40, price: 35000, plan: "credits_40" as PlanId, label: "40 créditos" },
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
  const transferCreditsFn = useServerFn(transferCredits);
  const updateClientFn = useServerFn(updateResellerClient);
  const deleteClientFn = useServerFn(deleteResellerClient);
  const getClientDetailsFn = useServerFn(getClientDetails);

  const { data: stats } = useQuery({ queryKey: ["reseller-stats"], queryFn: () => getStats() });
  const { data: network } = useQuery({ queryKey: ["reseller-network"], queryFn: () => getNetwork() });
  const { data: history } = useQuery({ queryKey: ["reseller-history"], queryFn: () => getHistory() });
  const { data: plans } = useQuery({ queryKey: ["reseller-plans"], queryFn: () => getPlans() });
  const { data: subData } = useSubscription();

  const isAccountActive = subData?.isActive || subData?.isTrial || (stats?.credits !== undefined && stats.credits > 0);

  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [resellerDialogOpen, setResellerDialogOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [activePurchasePlan, setActivePurchasePlan] = useState<PlanId | null>(null);
  const [pix, setPix] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  const [transferAmount, setTransferAmount] = useState("");

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

  const transferMutation = useMutation({
    mutationFn: (data: { recipientId: string; amount: number }) => transferCreditsFn({ data }),
    onSuccess: () => {
      toast.success("Créditos transferidos com sucesso!");
      setTransferDialogOpen(false);
      setTransferAmount("");
      qc.invalidateQueries({ queryKey: ["reseller-stats"] });
      qc.invalidateQueries({ queryKey: ["reseller-network"] });
      qc.invalidateQueries({ queryKey: ["reseller-history"] });
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
      {stats?.credits === 0 && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="font-bold">⚠️ Você está sem créditos disponíveis.</span>
              <p className="text-xs text-muted-foreground">
                Seu painel continua ativo, porém você não poderá criar novos clientes ou revendedores enquanto não adicionar novos créditos.
              </p>
            </div>
            <Button size="sm" onClick={() => setBuyDialogOpen(true)} className="shrink-0">
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Créditos
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
        <Card className={cn(
          "bg-gradient-to-br border-primary/20",
          stats?.credits === 0 ? "from-destructive/10 to-transparent border-destructive/30" : "from-primary/10 to-transparent border-primary/20"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Créditos Disponíveis
              <Wallet className={cn("h-4 w-4", stats?.credits === 0 ? "text-destructive" : "text-primary")} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-bold flex items-center gap-2", stats?.credits === 0 ? "text-destructive" : "")}>
              {stats?.credits === 0 ? "🔴" : "🟢"} {stats?.credits ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.credits === 0 ? "Saldo zerado — adicione créditos para revender" : "1 crédito = 1 mês de acesso p/ cliente"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Rede (Revendedores)
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.activeSubResellers ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Sub-revendedores ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Meus Clientes
              <Package className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.activeClients ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Clientes finais ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Receita Gerada
              <TrendingUp className="h-4 w-4 text-success" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBRL(stats?.revenue ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total de vendas diretas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="rede" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-xl">
          <TabsTrigger value="rede">Rede</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="rede" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Minha Rede</CardTitle>
                <CardDescription>Gerencie seus sub-revendedores (Mínimo 10 créditos).</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setResellerDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Criar Revendedor
              </Button>
            </CardHeader>
            <CardContent>
              {(!network || network.filter(u => u.is_reseller).length === 0) ? (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">Nenhum sub-revendedor encontrado.</p>
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  {network.filter(u => u.is_reseller).map((user: any) => (
                    <div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors gap-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                          {user.full_name?.[0] || "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{user.full_name || "Usuário sem nome"}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Membro desde: {new Date(user.created_at).toLocaleDateString("pt-BR")}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 pt-3 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo</div>
                          <div className="font-bold text-base font-mono">{user.credits} <span className="text-[10px] font-normal text-muted-foreground">créd.</span></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            size="sm" 
                            variant="secondary" 
                            className="h-8"
                            onClick={() => {
                              setSelectedRecipient(user);
                              setTransferDialogOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Enviar
                          </Button>
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">Ativo</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="clientes" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Meus Clientes</CardTitle>
                <CardDescription>Clientes finais usando seus planos (Não consome créditos).</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setClientDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Criar Cliente
              </Button>
            </CardHeader>
            <CardContent>
              {(!network || network.filter(u => !u.is_reseller).length === 0) ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm">Nenhum cliente final encontrado.</p>
                </div>
              ) : (
                <div className="space-y-4 mt-4">
                  {network.filter(u => !u.is_reseller).map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary/20 flex items-center justify-center font-bold text-secondary-foreground shrink-0">
                          {user.full_name?.[0] || "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{user.full_name || "Cliente"}</div>
                          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 hidden sm:inline-flex">Assinante</Badge>
                        <ManageClientDialog 
                          userId={user.id} 
                          onDone={() => qc.invalidateQueries({ queryKey: ["reseller-network"] })}
                          onUpdate={updateClientFn}
                          onDelete={deleteClientFn}
                          onGetDetails={getClientDetailsFn}
                        />
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
                      <div className={localCn(
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
                      <CardFooter className="flex flex-col gap-2 pt-4">
                        <div className="flex w-full gap-2">
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEditPlan(plan)}>
                            <Edit2 className="h-4 w-4 mr-2" /> Editar
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(plan.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {subData?.profile?.phone && (
                          <div className="w-full text-[10px] text-center text-muted-foreground p-1 bg-muted/50 rounded">
                            Pagamento via WhatsApp: {subData.profile.phone}
                          </div>
                        )}
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" /> Configurações de Revenda
              </CardTitle>
              <CardDescription>
                Configure as informações que seus clientes verão ao tentar renovar o plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="whatsapp">Seu WhatsApp de Atendimento</Label>
                <div className="flex gap-2">
                  <Input 
                    id="whatsapp"
                    placeholder="Ex: 5511999999999"
                    defaultValue={subData?.profile?.phone || ""}
                    onBlur={async (e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      const { error } = await supabase.from("profiles").update({ phone: val } as any).eq("id", user.id);
                      if (error) toast.error("Erro ao atualizar WhatsApp");
                      else {
                        toast.success("WhatsApp atualizado!");
                        qc.invalidateQueries({ queryKey: ["subscription", "me"] });
                      }
                    }}

                  />
                  <Button variant="outline" onClick={() => toast.info("O WhatsApp é salvo automaticamente ao sair do campo.")}>
                    Salvar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Este número será usado para os botões de "Contatar Revendedor" nos painéis dos seus clientes. Use o formato com DDD e sem espaços.
                </p>
              </div>
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
        isReseller={true}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["reseller-stats"] });
          qc.invalidateQueries({ queryKey: ["reseller-network"] });
        }}
      />

      <CreateResellerDialog
        open={clientDialogOpen}
        onOpenChange={setClientDialogOpen}
        isReseller={false}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["reseller-stats"] });
          qc.invalidateQueries({ queryKey: ["reseller-network"] });
        }}
      />
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Créditos</DialogTitle>
            <DialogDescription>
              Envie créditos da sua carteira para {selectedRecipient?.full_name || "este revendedor"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quantidade de créditos</Label>
              <Input 
                type="number" 
                placeholder="Ex: 10" 
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Seu saldo: {stats?.credits ?? 0} créditos
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>Cancelar</Button>
            <Button 
              disabled={transferMutation.isPending || !transferAmount || parseInt(transferAmount) <= 0}
              onClick={() => {
                if (window.confirm(`Enviar ${transferAmount} créditos para ${selectedRecipient?.full_name}?`)) {
                  transferMutation.mutate({
                    recipientId: selectedRecipient.id,
                    amount: parseInt(transferAmount)
                  });
                }
              }}
            >
              {transferMutation.isPending ? "Enviando..." : "Confirmar Envio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function ManageClientDialog({ 
  userId, 
  onDone, 
  onUpdate, 
  onDelete, 
  onGetDetails 
}: { 
  userId: string; 
  onDone: () => void;
  onUpdate: any;
  onDelete: any;
  onGetDetails: any;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    plan: "basic",
    status: "active"
  });

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const data = await onGetDetails({ data: { userId } });
      setDetails(data);
      setForm({
        fullName: data.full_name || "",
        email: data.email || "",
        password: "",
        plan: data.subscription?.plan || "basic",
        status: data.subscription?.status || "active"
      });
    } catch (e: any) {
      toast.error(e.message);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const updateMut = useMutation({
    mutationFn: (data: any) => onUpdate({ data: { ...data, userId } }),
    onSuccess: () => {
      toast.success("Cliente atualizado!");
      onDone();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message)
  });

  const deleteMut = useMutation({
    mutationFn: () => onDelete({ data: { userId } }),
    onSuccess: () => {
      toast.success("Cliente excluído!");
      onDone();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) fetchDetails();
    }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Cliente</DialogTitle>
          <DialogDescription>
            Visualize e edite as informações do seu cliente final.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground animate-pulse">Carregando detalhes...</div>
        ) : details && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2 text-[10px] bg-muted/50 p-3 rounded-lg">
              <div>
                <span className="text-muted-foreground block uppercase">Criado em</span>
                <span className="font-medium">{new Date(details.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              <div>
                <span className="text-muted-foreground block uppercase">Vencimento</span>
                <span className="font-medium">
                  {details.subscription?.expires_at 
                    ? new Date(details.subscription.expires_at).toLocaleDateString("pt-BR") 
                    : "Sem data"}
                </span>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Nova Senha (deixe em branco para manter)</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value as any })}
                  >
                    <option value="trial">Teste</option>
                    <option value="basic">Básico</option>
                    <option value="monthly">Mensal</option>
                    <option value="yearly">Anual</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                  >
                    <option value="active">Ativo</option>
                    <option value="expired">Expirado</option>
                    <option value="trial">Em Teste</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t">
              <Button onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending}>
                {updateMut.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (window.confirm("Tem certeza que deseja excluir este cliente permanentemente?")) {
                    deleteMut.mutate();
                  }
                }}
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? "Excluindo..." : "Excluir Cliente"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function localCn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}

