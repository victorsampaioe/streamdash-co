import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Pencil, Rocket, Users, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { listMyAccounts, updateMyAccount, activateMyAccount } from "@/lib/reseller-accounts.functions";

type Account = {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  accountType: "client" | "reseller" | "sub_reseller" | string;
  isReseller: boolean;
  plan: string | null;
  expiresAt: string | null;
  credits: number;
  status: "trial" | "active" | "expired" | string;
};

const TYPE_LABEL: Record<string, string> = {
  client: "Cliente",
  reseller: "Revendedor",
  sub_reseller: "Sub-revendedor",
};

const PLAN_LABEL: Record<string, string> = {
  trial: "Teste",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
  reseller: "Revendedor",
  basic: "Básico",
};

const ACTIVATION_PLANS = [
  { value: "trial", label: "Teste (1 dia) — grátis" },
  { value: "monthly", label: "Mensal (30 dias) — 1 crédito" },
  { value: "quarterly", label: "Trimestral (90 dias) — 3 créditos" },
  { value: "semiannual", label: "Semestral (180 dias) — 6 créditos" },
  { value: "annual", label: "Anual (365 dias) — 12 créditos" },
];

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR");
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    trial: "bg-primary/10 text-primary border-primary/20",
    expired: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const label: Record<string, string> = { active: "Ativo", trial: "Teste", expired: "Expirado" };
  return (
    <Badge variant="outline" className={cn("border-transparent", map[status] ?? "")}>
      {label[status] ?? status}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls =
    type === "client"
      ? "bg-sky-500/10 text-sky-500 border-sky-500/20"
      : "bg-purple-500/10 text-purple-500 border-purple-500/20";
  return (
    <Badge variant="outline" className={cn("border-transparent", cls)}>
      {TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

export function AccountsManager({
  kind,
  onCreate,
}: {
  kind: "client" | "reseller";
  onCreate?: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyAccounts);
  const updateFn = useServerFn(updateMyAccount);
  const activateFn = useServerFn(activateMyAccount);

  const { data, isLoading } = useQuery({
    queryKey: ["my-accounts"],
    queryFn: () => listFn() as Promise<Account[]>,
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "expired" | "trial">("all");
  const [editing, setEditing] = useState<Account | null>(null);
  const [activating, setActivating] = useState<Account | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", plan: "", expiresAt: "", status: "", credits: "0" });
  const [activationPlan, setActivationPlan] = useState("monthly");

  const rows = useMemo(() => {
    const list = (data ?? []).filter((a) => (kind === "reseller" ? a.isReseller : !a.isReseller));
    const q = search.trim().toLowerCase();
    return list.filter((a) => {
      const matchQ = !q || (a.fullName ?? "").toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q);
      const matchS = statusFilter === "all" || a.status === statusFilter;
      return matchQ && matchS;
    });
  }, [data, kind, search, statusFilter]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-accounts"] });
    qc.invalidateQueries({ queryKey: ["reseller-stats"] });
    qc.invalidateQueries({ queryKey: ["reseller-network"] });
  };

  const updateMut = useMutation({
    mutationFn: (payload: any) => updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Conta atualizada!");
      setEditing(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar."),
  });

  const activateMut = useMutation({
    mutationFn: (payload: any) => activateFn({ data: payload }),
    onSuccess: (r: any) => {
      toast.success(`Assinatura ativada até ${fmtDate(r?.expiresAt)}`);
      setActivating(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao ativar."),
  });

  function openEdit(a: Account) {
    setEditing(a);
    setForm({
      fullName: a.fullName ?? "",
      email: a.email ?? "",
      password: "",
      plan: a.plan ?? "",
      expiresAt: a.expiresAt ? a.expiresAt.slice(0, 10) : "",
      status: a.status === "trial" ? "trial" : a.status === "active" ? "active" : "expired",
      credits: String(a.credits ?? 0),
    });
  }

  function submitEdit() {
    if (!editing) return;
    const payload: any = { userId: editing.id };
    if (form.fullName && form.fullName !== editing.fullName) payload.fullName = form.fullName;
    if (form.email && form.email !== editing.email) payload.email = form.email;
    if (form.password) payload.password = form.password;
    if (!editing.isReseller) {
      if (form.plan && form.plan !== editing.plan) payload.plan = form.plan;
      if (form.expiresAt && form.expiresAt !== (editing.expiresAt ?? "").slice(0, 10)) payload.expiresAt = form.expiresAt;
      if (form.status) payload.status = form.status;
    } else {
      const delta = parseInt(form.credits || "0", 10) - (editing.credits ?? 0);
      if (delta) payload.creditsDelta = delta;
    }
    updateMut.mutate(payload);
  }

  const isReseller = kind === "reseller";

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">{isReseller ? "Minha Rede" : "Meus Clientes"}</CardTitle>
          <CardDescription>
            {isReseller
              ? "Sub-revendedores criados por você — créditos, dados de acesso e status."
              : "Clientes criados por você — plano, validade, status e ativação."}
          </CardDescription>
        </div>
        {onCreate && (
          <Button size="sm" variant="outline" onClick={onCreate}>
            {isReseller ? "Criar Revendedor" : "Criar Cliente"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              {!isReseller && <SelectItem value="trial">Em teste</SelectItem>}
              <SelectItem value="expired">{isReseller ? "Sem saldo" : "Expirados"}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Carregando contas...</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            {isReseller ? (
              <Package className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            ) : (
              <Users className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            )}
            <p className="text-muted-foreground text-sm">
              Nenhuma conta encontrada{search || statusFilter !== "all" ? " com esses filtros." : "."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((a) => (
              <div
                key={a.id}
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                    {a.fullName?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{a.fullName || "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.email}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Criado em {fmtDate(a.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <TypeBadge type={a.accountType} />
                  {isReseller ? (
                    <div className="text-left lg:text-right">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Créditos</div>
                      <div className="font-bold font-mono text-sm">{a.credits}</div>
                    </div>
                  ) : (
                    <>
                      <div className="text-left lg:text-right">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Plano</div>
                        <div className="text-sm font-medium">{a.plan ? PLAN_LABEL[a.plan] ?? a.plan : "—"}</div>
                      </div>
                      <div className="text-left lg:text-right">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Validade</div>
                        <div className="text-sm font-medium">{fmtDate(a.expiresAt)}</div>
                      </div>
                    </>
                  )}
                  <StatusBadge status={a.status} />
                  <div className="flex items-center gap-2">
                    {!isReseller && (
                      <Button size="sm" variant="secondary" onClick={() => { setActivating(a); setActivationPlan("monthly"); }}>
                        <Rocket className="h-4 w-4 mr-1" /> Ativar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {editing?.isReseller ? "revendedor" : "cliente"}</DialogTitle>
            <DialogDescription>Atualize os dados da conta criada por você.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Login (e-mail)</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Nova senha (opcional)</Label>
              <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Deixe em branco para manter" />
            </div>

            {editing?.isReseller ? (
              <div className="space-y-1.5">
                <Label>Créditos</Label>
                <Input type="number" min={0} value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} />
                <p className="text-[10px] text-muted-foreground">
                  Aumentar transfere créditos do seu saldo; reduzir devolve ao seu saldo.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Plano</Label>
                  <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Teste</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="quarterly">Trimestral</SelectItem>
                      <SelectItem value="semiannual">Semestral</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data de vencimento</Label>
                  <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">Teste</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="expired">Expirado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate dialog */}
      <Dialog open={!!activating} onOpenChange={(o) => !o && setActivating(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>Ativar assinatura</DialogTitle>
            <DialogDescription>
              {activating?.fullName || activating?.email} — o tempo é somado à validade atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Plano</Label>
            <Select value={activationPlan} onValueChange={setActivationPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVATION_PLANS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">1 crédito = 1 mês de acesso. O teste é gratuito.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setActivating(null)}>Cancelar</Button>
            <Button
              onClick={() => activating && activateMut.mutate({ userId: activating.id, plan: activationPlan })}
              disabled={activateMut.isPending}
            >
              {activateMut.isPending ? "Ativando..." : "Ativar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
