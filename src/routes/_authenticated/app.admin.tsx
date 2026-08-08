import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Activity,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Crown,
  Gift,
  Search,
  Send,
  ServerCog,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { broadcastTelegram } from "@/lib/telegram-broadcast.functions";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PausedServersPanel } from "@/components/admin/paused-servers-panel";
import { UserCog, History, PlusCircle, UserCheck, UserRoundCog, Settings2, Trash2 } from "lucide-react";

import { StorageReportCard } from "@/components/storage-report-card";
import { AlertCircle } from "lucide-react";
import { convertToReseller } from "@/lib/reseller-conversion.functions";
import { updateReseller } from "@/lib/reseller-update.functions";
import { deleteUserAdmin } from "@/lib/admin-actions.functions";
import { updateClientAdmin } from "@/lib/admin-client-update.functions";


export const Route = createFileRoute("/_authenticated/app/admin")({
  beforeLoad: async ({ context }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    
    const { data: isAdmin, error } = await supabase.rpc("has_role", { 
      _user_id: user.id, 
      _role: "admin" 
    });
    
    if (error || !isAdmin) {
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({
    meta: [
      { title: "Painel Admin — StreamMonitor" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  is_admin: boolean;
  is_reseller: boolean;
  credits: number;
  parent_id: string | null;
  owner_id: string | null;
  plan: "trial" | "monthly" | "yearly" | "reseller" | "basic" | null;
  status: "trial" | "active" | "expired" | "cancelled" | "approved" | null;
  expires_at: string | null;
  days_remaining: number | null;
  total_paid_cents: number;
  last_payment_at: string | null;
};

type StatsRow = {
  total_users: number;
  new_users_7d: number;
  new_users_30d: number;
  trial_active: number;
  paid_active: number;
  expired: number;
  cancelled: number;
  expiring_7d: number;
  monthly_subs: number;
  yearly_subs: number;
  payments_pending: number;
  payments_approved_total: number;
  revenue_cents_total: number;
  revenue_cents_30d: number;
  revenue_cents_7d: number;
  total_servers: number;
  servers_online: number;
  servers_warning: number;
  servers_offline: number;
  servers_paused: number;
  paused_owners: number;
};

type FilterKey = "all" | "paid" | "trial" | "expired" | "admin" | "reseller" | "client";

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // Check admin role explicitly before anything else
  const adminCheckQ = useQuery({
    queryKey: ["is-admin"],
    staleTime: 1000 * 60 * 5, // 5 mins
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("Admin check: No user found");
        return false;
      }
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) {
        console.error("Admin role check error:", error);
        throw error;
      }
      console.log("Admin check result for", user.email, ":", data);
      return !!data;
    },
  });

  const isAdmin = adminCheckQ.data === true;

  // Debug logs
  useEffect(() => {
    if (adminCheckQ.isSuccess) {
      console.log("Admin verification finished:", adminCheckQ.data);
    }
    if (adminCheckQ.isError) {
      console.error("Admin verification failed:", adminCheckQ.error);
    }
  }, [adminCheckQ.isSuccess, adminCheckQ.isError, adminCheckQ.data, adminCheckQ.error]);

  useEffect(() => {
    if (adminCheckQ.isSuccess && !isAdmin) {
      console.warn("User is not admin, redirecting...");
      toast.error("Acesso negado: você não tem permissão de administrador.");
    }
  }, [adminCheckQ.isSuccess, isAdmin]);

  const statsQ = useQuery({
    queryKey: ["admin-stats"],
    enabled: isAdmin,
    retry: 1,
    queryFn: async () => {
      console.log("Fetching admin stats...");
      const { data, error } = await supabase.rpc("get_admin_stats");
      if (error) {
        console.error("Admin stats error:", error);
        throw error;
      }
      return data as unknown as StatsRow;
    },
  });

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    retry: 1,
    queryFn: async () => {
      console.log("Fetching admin users...");
      const { data, error } = await supabase.rpc("get_admin_users_v2");
      if (error) {
        console.error("Admin users error:", error);
        throw error;
      }
      return (data ?? []) as any[];
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Papel atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = statsQ.data;
  const users = usersQ.data ?? [];

  const filtered = useMemo(() => {
    const now = Date.now();
    return users.filter((u) => {
      if (filter === "paid" && !(u.status === "active" && u.expires_at && new Date(u.expires_at).getTime() > now)) return false;
      if (filter === "trial" && !(u.status === "trial" && u.expires_at && new Date(u.expires_at).getTime() > now)) return false;
      if (filter === "expired" && !(u.expires_at && new Date(u.expires_at).getTime() <= now)) return false;
      if (filter === "admin" && !u.is_admin) return false;
      if (filter === "reseller" && !(u as any).is_reseller) return false;
      if (filter === "client" && (u as any).is_reseller) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [users, filter, search]);

  if (adminCheckQ.isLoading) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Verificando permissões...</div>;
  }

  if (adminCheckQ.isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">Erro ao verificar permissões</h1>
        <p className="text-muted-foreground max-w-sm">
          {adminCheckQ.error instanceof Error ? adminCheckQ.error.message : "Não foi possível confirmar seu acesso administrativo."}
        </p>
        <Button onClick={() => adminCheckQ.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="text-muted-foreground">Esta área é exclusiva para administradores.</p>
        <div className="bg-muted p-3 rounded-md text-xs font-mono max-w-sm overflow-auto text-left">
          Status: {adminCheckQ.status}<br/>
          Data: {JSON.stringify(adminCheckQ.data)}<br/>
          IsAdminVar: {isAdmin ? "true" : "false"}<br/>
          User: {adminCheckQ.data === false ? "Não encontrado ou não admin" : "Verificando..."}
        </div>
        <Button onClick={() => navigate({ to: "/app" })}>Voltar ao painel</Button>
      </div>
    );
  }



  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Painel administrativo</h1>
          <p className="text-sm text-muted-foreground">Visão geral de usuários, assinaturas e receita.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Usuários totais" value={s?.total_users} tone="primary" sub={s ? `+${s.new_users_7d} nos últimos 7 dias` : undefined} />
        <Kpi icon={BadgeCheck} label="Assinantes ativos" value={s?.paid_active} tone="success" sub={s ? `${s.monthly_subs} mensal · ${s.yearly_subs} anual` : undefined} />
        <Kpi icon={Gift} label="Em teste grátis" value={s?.trial_active} tone="warning" />
        <Kpi icon={XCircle} label="Expirados" value={s?.expired} tone="destructive" sub={s ? `${s.expiring_7d} vencem em 7 dias` : undefined} />
        <Kpi icon={Wallet} label="Créditos disponíveis" value="∞" tone="primary" sub="Créditos ilimitados" />
        <Kpi icon={CircleDollarSign} label="Receita 30 dias" value={s ? formatBRL(s.revenue_cents_30d) : undefined} tone="success" sub={s ? `${formatBRL(s.revenue_cents_7d)} nos últimos 7d` : undefined} />
        <Kpi icon={TrendingUp} label="Receita total" value={s ? formatBRL(s.revenue_cents_total) : undefined} tone="primary" sub={s ? `${s.payments_approved_total} pagamentos` : undefined} />
        <Kpi icon={ServerCog} label="Servidores monitorados" value={s?.total_servers} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={ServerCog} label="🟢 Online" value={s?.servers_online} tone="success" />
        <Kpi icon={ServerCog} label="🟡 Atenção" value={s?.servers_warning} tone="warning" />
        <Kpi icon={ServerCog} label="🔴 Offline" value={s?.servers_offline} tone="destructive" />
        <Kpi
          icon={ServerCog}
          label="⚪ DNS Pausados"
          value={s?.servers_paused}
          sub={s ? `${s.paused_owners} contas expiradas/sem créditos` : undefined}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="resellers">Gerenciar Revendedores</TabsTrigger>
          <TabsTrigger value="paused">DNS Pausados</TabsTrigger>
          <TabsTrigger value="storage">Armazenamento</TabsTrigger>
        </TabsList>

        <TabsContent value="paused" className="space-y-6">
          <PausedServersPanel />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <TelegramBroadcastCard />
          
          <Card className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <h2 className="font-semibold truncate">Usuários cadastrados</h2>
                <Badge variant="outline" className="shrink-0">{filtered.length}</Badge>
              </div>
              <div className="w-full sm:w-auto">
                <div className="relative w-full sm:w-72">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por nome, e-mail, telefone..." 
                    value={search} 
                    onChange={(e) => setSearch(e.target.value)} 
                    className="pl-8 w-full" 
                    id="admin-user-search"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>Todos</FilterChip>
              <FilterChip active={filter === "reseller"} onClick={() => setFilter("reseller")} tone="primary">🟣 Revendedores</FilterChip>
              <FilterChip active={filter === "client"} onClick={() => setFilter("client")} tone="success">🔵 Clientes</FilterChip>
              <FilterChip active={filter === "admin"} onClick={() => setFilter("admin")} tone="primary">Admins</FilterChip>
              <FilterChip active={filter === "expired"} onClick={() => setFilter("expired")} tone="destructive">Expirados</FilterChip>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Usuário</th>
                    <th className="text-left p-3 font-medium">Tipo de Conta</th>
                    <th className="text-left p-3 font-medium">Plano / Créditos</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Vencimento</th>
                    <th className="text-right p-3 font-medium">Total pago</th>
                    <th className="text-left p-3 font-medium">Cadastro</th>
                    <th className="text-right p-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usersQ.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
                  {!usersQ.isLoading && filtered.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
                  )}
                  {filtered.map((u) => {
                    const now = Date.now();
                    const expTs = u.expires_at ? new Date(u.expires_at).getTime() : 0;
                    const expired = expTs > 0 && expTs <= now;
                    const expiringSoon = !expired && u.days_remaining !== null && u.days_remaining <= 7;
                    return (
                      <tr key={u.id} className="border-t border-border/60 hover:bg-muted/20">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {u.is_admin && <Crown className="h-3.5 w-3.5 text-primary" />}
                            <div>
                              <div className="font-medium">{u.full_name ?? "—"}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          {(u as any).is_reseller ? (
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                              🟣 Revendedor
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                              🔵 Cliente
                            </Badge>
                          )}
                        </td>
                        <td className="p-3">
                          {(u as any).is_reseller ? (
                            <div className="flex items-center gap-1.5 font-medium text-purple-500">
                              <Wallet className="h-3.5 w-3.5" />
                              {(u as any).credits || 0} créditos
                            </div>
                          ) : (
                            <PlanBadge plan={u.plan} />
                          )}
                        </td>
                        <td className="p-3"><StatusBadge status={u.status} expired={expired} /></td>
                        <td className="p-3">
                          {(u as any).is_reseller ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <>
                              <div className={cn("text-xs flex items-center gap-1", expired && "text-destructive", expiringSoon && "text-warning")}>
                                <CalendarClock className="h-3 w-3" />
                                {u.expires_at ? new Date(u.expires_at).toLocaleDateString("pt-BR") : "—"}
                              </div>
                              {u.days_remaining !== null && !expired && (
                                <div className="text-[10px] text-muted-foreground">{u.days_remaining} dia(s)</div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono text-xs">
                          {u.total_paid_cents > 0 ? formatBRL(u.total_paid_cents) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-2">
                            <GrantPlanDialog user={u} />
                            {!u.is_admin && !((u as any).is_reseller) && (
                              <>
                                <EditClientDialog 
                                  user={u} 
                                  isAdminUser={u.is_admin}
                                  onToggleAdmin={(id, val) => toggleAdmin.mutate({ userId: id, makeAdmin: val })}
                                  onDone={() => {
                                    usersQ.refetch();
                                  }} 
                                />
                                <ConvertToResellerDialog user={u} onDone={() => usersQ.refetch()} />
                              </>
                            )}
                            {((u as any).is_reseller) && (
                              <EditResellerDialog 
                                 reseller={{
                                  id: u.id,
                                  email: u.email,
                                  full_name: u.full_name,
                                  created_at: u.created_at,
                                  credits: u.credits || 0,
                                  parent_id: u.parent_id,
                                  owner_id: u.owner_id,
                                  sub_reseller_count: 0,
                                  client_count: 0,
                                  last_activity_at: null
                                }} 

                                isAdminUser={u.is_admin}
                                onToggleAdmin={(id, val) => toggleAdmin.mutate({ userId: id, makeAdmin: val })}
                                onDone={() => {
                                  usersQ.refetch();
                                }} 
                              />
                            )}
                            <Button size="sm" variant={u.is_admin ? "outline" : "default"} onClick={() => toggleAdmin.mutate({ userId: u.id, makeAdmin: !u.is_admin })}>
                              {u.is_admin ? "Remover admin" : "Tornar admin"}
                            </Button>
                            {!u.is_admin && (
                              <DeleteUserDialog userId={u.id} userEmail={u.email || ""} onDone={() => usersQ.refetch()} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="resellers">
          <ResellerManagementSection />
        </TabsContent>

        <TabsContent value="storage">
          <StorageReportCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type AdminReseller = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  credits: number;
  parent_id: string | null;
  owner_id: string | null;
  sub_reseller_count: number;
  client_count: number;
  last_activity_at: string | null;
};


function ResellerManagementSection() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const resellersQ = useQuery({
    queryKey: ["admin-resellers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_resellers_v2");
      if (error) throw error;
      return (data ?? []) as AdminReseller[];
    },
  });

  const resellers = resellersQ.data ?? [];
  const filtered = resellers.filter(r => 
    r.email?.toLowerCase().includes(search.toLowerCase()) || 
    r.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Gestão de Revendedores</h2>
            <Badge variant="outline">{filtered.length}</Badge>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input 
              placeholder="Buscar revendedor..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="pl-8" 
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Revendedor</th>
                <th className="text-left p-3 font-medium">Pertence a</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Créditos</th>
                <th className="text-right p-3 font-medium">Sub-Revendas</th>
                <th className="text-left p-3 font-medium">Última Atividade</th>

                <th className="text-right p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {resellersQ.isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
              {!resellersQ.isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum revendedor encontrado.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                  <td className="p-3">
                    <div className="font-medium">{r.full_name ?? "—"}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="p-3">
                    {r.owner_id ? (
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-primary leading-tight">
                          {resellers.find(p => p.id === r.owner_id)?.full_name || "Dono desconhecido"}
                        </span>
                        <span className="text-[9px] text-muted-foreground leading-tight">
                          {r.parent_id === r.owner_id ? "Venda Direta" : "Sub-Rede"}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0 h-4">Admin Global</Badge>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant="default" className="bg-success text-success-foreground text-[10px] py-0 h-4">Ativo</Badge>
                  </td>

                  <td className="p-3 text-right">
                    <Badge variant="outline" className="font-mono text-[11px]">{r.credits}</Badge>
                  </td>

                  <td className="p-3 text-right font-mono">{r.sub_reseller_count}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString("pt-BR") : "—"}
                  </td>

                  <td className="p-3 text-right space-x-1">
                    <AdminAddCreditsDialog reseller={r} onDone={() => resellersQ.refetch()} />
                    <EditResellerDialog reseller={r} onDone={() => resellersQ.refetch()} />
                    <ResellerDetailsDialog reseller={r} />
                    <DeleteUserDialog userId={r.id} userEmail={r.email || ""} onDone={() => resellersQ.refetch()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function AdminAddCreditsDialog({ reseller, onDone }: { reseller: AdminReseller; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  
  const add = useMutation({
    mutationFn: async (amt: number) => {
      const { error } = await supabase.rpc("admin_add_credits", {
        _user_id: reseller.id,
        _amount: amt
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Créditos adicionados com sucesso!");
      setOpen(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><PlusCircle className="h-3.5 w-3.5 mr-1" /> Créditos</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Créditos</DialogTitle>
          <DialogDescription>
            Revendedor: {reseller.full_name ?? reseller.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Atual</div>
            <div className="text-2xl font-bold">{reseller.credits} créditos</div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Quantidade a adicionar</label>
            <div className="flex gap-2">
              {[10, 30, 40, 100].map(v => (
                <Button key={v} type="button" variant="outline" size="sm" onClick={() => setAmount(String(v))}>
                  +{v}
                </Button>
              ))}
            </div>
            <Input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              placeholder="Ex: 50"
            />
          </div>
          <Button 
            className="w-full" 
            onClick={() => add.mutate(Number(amount))}
            disabled={add.isPending || !Number(amount) || Number(amount) <= 0}
          >
            {add.isPending ? "Adicionando..." : "Confirmar Adição"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResellerDetailsDialog({ reseller }: { reseller: AdminReseller }) {
  const [open, setOpen] = useState(false);
  
  const historyQ = useQuery({
    queryKey: ["admin-reseller-history", reseller.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_history")
        .select("*")
        .eq("user_id", reseller.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><History className="h-3.5 w-3.5 mr-1" /> Detalhes</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Detalhes do Revendedor
          </DialogTitle>
          <DialogDescription>
            Informações e histórico de {reseller.full_name ?? reseller.email}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-md p-3">
              <div className="text-[10px] text-muted-foreground uppercase">Saldo</div>
              <div className="text-lg font-bold font-mono">{reseller.credits}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-[10px] text-muted-foreground uppercase">Sub-Revendas</div>
              <div className="text-lg font-bold font-mono">{reseller.sub_reseller_count}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-[10px] text-muted-foreground uppercase">Membro desde</div>
              <div className="text-lg font-bold">{new Date(reseller.created_at).toLocaleDateString("pt-BR")}</div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Histórico de Créditos
            </h3>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-right p-2">Valor</th>
                    <th className="text-left p-2">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyQ.isLoading && <tr><td colSpan={4} className="p-4 text-center">Carregando...</td></tr>}
                  {!historyQ.isLoading && historyQ.data?.length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sem histórico registrado.</td></tr>
                  )}
                  {historyQ.data?.map((h: any) => (
                    <tr key={h.id} className="hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={h.type === "purchase" || h.type === "transfer_in" ? "text-success border-success/30" : "text-destructive border-destructive/30"}>
                          {h.type === "purchase" ? "Compra" : h.type === "transfer_in" ? "Entrada" : "Saída"}
                        </Badge>
                      </td>
                      <td className={cn("p-2 text-right font-mono font-medium", h.amount > 0 ? "text-success" : "text-destructive")}>
                        {h.amount > 0 ? `+${h.amount}` : h.amount}
                      </td>
                      <td className="p-2 text-muted-foreground max-w-[200px] truncate">{h.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function Kpi({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: number | string | undefined; sub?: string;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10 border-primary/20",
    success: "text-success bg-success/10 border-success/20",
    warning: "text-warning bg-warning/10 border-warning/20",
    destructive: "text-destructive bg-destructive/10 border-destructive/20",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-0.5 truncate">
            {value === undefined ? <span className="inline-block h-6 w-16 rounded bg-muted animate-pulse" /> : value}
          </div>
          {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
        </div>
        <div className={cn("h-8 w-8 rounded-md border flex items-center justify-center shrink-0", tone ? toneMap[tone] : "bg-muted border-border")}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function FilterChip({ active, onClick, tone, children }: { active: boolean; onClick: () => void; tone?: "success" | "warning" | "destructive" | "primary"; children: React.ReactNode }) {
  const activeMap: Record<string, string> = {
    success: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/15 text-warning border-warning/30",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    primary: "bg-primary/15 text-primary border-primary/30",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-3 py-1 rounded-full border transition-colors",
        active
          ? (tone ? activeMap[tone] : "bg-foreground text-background border-foreground")
          : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

function PlanBadge({ plan }: { plan: AdminUser["plan"] }) {
  if (!plan) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, { label: string; cls: string }> = {
    trial: { label: "Teste", cls: "border-warning/40 text-warning" },
    monthly: { label: "Mensal", cls: "border-primary/40 text-primary" },
    yearly: { label: "Anual", cls: "border-success/40 text-success" },
  };
  
  const config = map[plan as string];
  if (!config) return <Badge variant="outline" className="font-medium">{plan}</Badge>;
  
  return <Badge variant="outline" className={cn("font-medium", config.cls)}>{config.label}</Badge>;
}

function StatusBadge({ status, expired }: { status: AdminUser["status"]; expired: boolean }) {
  if (expired) return <Badge variant="destructive">Expirado</Badge>;
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map = {
    trial: <Badge variant="outline" className="border-warning/40 text-warning"><Gift className="h-3 w-3 mr-1" />Em teste</Badge>,
    active: <Badge className="bg-success text-success-foreground"><Activity className="h-3 w-3 mr-1" />Ativo</Badge>,
    expired: <Badge variant="destructive">Expirado</Badge>,
    cancelled: <Badge variant="outline">Cancelado</Badge>,
  };
  return map[status as keyof typeof map] || <Badge variant="outline">{status}</Badge>;
}

function TelegramBroadcastCard() {
  const [message, setMessage] = useState("✅ StreamMonitor está online! Todas as suas monitorações estão sendo executadas normalmente.");
  const PROMO_MSG = "🔥 <b>UMA HOJE PROMOÇÃO PARA HOJE MEUS REVENDA ADMIN</b>\n\nValor de <b>R$ 35,00</b> por apenas <b>R$ 25,00</b> válido só hoje!\n\n👉 Assine agora pelo PIX: https://streammonitor.site/app/subscription";
  const send = useServerFn(broadcastTelegram);
  const mut = useMutation({
    mutationFn: async (msg: string) => await send({ data: { message: msg } }),
    onSuccess: (r: any) => toast.success(`Enviado para ${r.sent}/${r.total} usuários${r.failed ? ` · ${r.failed} falhas` : ""}`),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-4 space-y-3 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Broadcast Telegram</h2>
        <Badge variant="outline" className="text-xs">Somente admin</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Envia esta mensagem para todos os usuários que já configuraram o Telegram como canal de alerta.
      </p>
      <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={() => setMessage(PROMO_MSG)}>
          🔥 Mensagem Promoção Mensal R$25
        </Button>
        <Button onClick={() => mut.mutate(message)} disabled={mut.isPending || !message.trim()}>
          <Send className="h-4 w-4 mr-2" />
          {mut.isPending ? "Enviando..." : "Enviar para todos"}
        </Button>
      </div>
    </Card>
  );
}


function GrantPlanDialog({ user }: { user: AdminUser }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("30");

  const grant = useMutation({
    mutationFn: async ({ plan, d }: { plan: "monthly" | "yearly" | "trial"; d: number }) => {
      const { error } = await supabase.rpc("admin_grant_subscription", {
        _user_id: user.id,
        _plan: plan,
        _days: d,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Assinatura atualizada");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><CalendarClock className="h-3.5 w-3.5 mr-1" />Plano</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liberar acesso</DialogTitle>
          <DialogDescription className="truncate">{user.full_name ?? user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            O tempo é somado ao vencimento atual{user.expires_at ? ` (${new Date(user.expires_at).toLocaleDateString("pt-BR")})` : ""}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={grant.isPending} onClick={() => grant.mutate({ plan: "monthly", d: 31 })}>1 mês (31d)</Button>
            <Button disabled={grant.isPending} onClick={() => grant.mutate({ plan: "yearly", d: 365 })}>1 ano (365d)</Button>
            <Button variant="outline" disabled={grant.isPending} onClick={() => grant.mutate({ plan: "monthly", d: 7 })}>+7 dias</Button>
            <Button variant="outline" disabled={grant.isPending} onClick={() => grant.mutate({ plan: "trial", d: 2 })}>Teste 2 dias</Button>
          </div>
          <div className="flex items-end gap-2 pt-2 border-t">
            <div className="flex-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Dias personalizados</label>
              <Input type="number" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <Button
              variant="secondary"
              disabled={grant.isPending || !Number(days)}
              onClick={() => grant.mutate({ plan: Number(days) >= 365 ? "yearly" : "monthly", d: Number(days) })}
            >
              Aplicar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConvertToResellerDialog({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [credits, setCredits] = useState("10");

  // Reset state when dialog opens or user changes
  useEffect(() => {
    if (open) {
      setFullName(user.full_name || "");
      setEmail(user.email || "");
      setCredits("10");
    }
  }, [open, user]);
  
  const convertFn = useServerFn(convertToReseller);
  const mut = useMutation({
    mutationFn: () => convertFn({ data: { 
      userId: user.id, 
      fullName, 
      email, 
      initialCredits: Number(credits) 
    } }),
    onSuccess: () => {
      toast.success("Usuário convertido para revendedor!");
      setOpen(false);
      onDone();
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="bg-success/20 hover:bg-success/30 text-success border-success/30">
          <UserRoundCog className="h-3.5 w-3.5 mr-1" />
          Tornar Revendedor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Converter para Revendedor</DialogTitle>
          <DialogDescription>
            Configurações para {user.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Créditos Iniciais</Label>
            <Input type="number" min={0} value={credits} onChange={(e) => setCredits(e.target.value)} />
            <p className="text-[10px] text-muted-foreground">Mínimo 10 créditos para criar sub-revendas.</p>
          </div>
          <Button className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Convertendo..." : "Confirmar Conversão"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditResellerDialog({ reseller, onDone, isAdminUser, onToggleAdmin }: { reseller: AdminReseller; onDone: () => void; isAdminUser?: boolean; onToggleAdmin?: (userId: string, makeAdmin: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(reseller.full_name || "");
  const [email, setEmail] = useState(reseller.email || "");
  const [password, setPassword] = useState("");
  const [creditsChange, setCreditsChange] = useState("0");
  const [status, setStatus] = useState<"active" | "expired" | "trial" | "cancelled">("active");
  
  // Update state when reseller changes or dialog opens
  useEffect(() => {
    if (open) {
      setFullName(reseller.full_name || "");
      setEmail(reseller.email || "");
      setPassword("");
      setCreditsChange("0");
    }
  }, [open, reseller]);

  const updateFn = useServerFn(updateReseller);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: { 
      userId: reseller.id, 
      fullName, 
      email, 
      password: password || undefined,
      status,
      creditsChange: Number(creditsChange)
    } }),
    onSuccess: () => {
      toast.success("Dados do revendedor atualizados!");
      setOpen(false);
      onDone();
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Revendedor</DialogTitle>
          <DialogDescription>
            Alterar dados de {reseller.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nova Senha (deixe em branco para manter)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status da Conta</Label>
              <select 
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="active">Ativo</option>
                <option value="expired">Expirado</option>
                <option value="trial">Em Teste</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Ajuste de Créditos</Label>
              <Input 
                type="number" 
                value={creditsChange} 
                onChange={(e) => setCreditsChange(e.target.value)} 
                placeholder="Ex: 10 ou -5"
              />
              <p className="text-[10px] text-muted-foreground">Positivo adiciona, negativo remove.</p>
            </div>
          </div>
          
          {onToggleAdmin && (
            <div className="rounded-md border p-3 bg-muted/30 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Tipo de Conta</div>
                <div className="text-sm font-medium">{isAdminUser ? "Administrador" : "Revendedor / Cliente"}</div>
              </div>
              <Button 
                size="sm" 
                variant={isAdminUser ? "destructive" : "default"}
                onClick={() => onToggleAdmin(reseller.id, !isAdminUser)}
              >
                {isAdminUser ? "Remover Admin" : "Tornar Admin"}
              </Button>
            </div>
          )}

          <div className="rounded-md border p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Atual</div>
            <div className="text-lg font-bold">{reseller.credits} créditos</div>
          </div>

          <Button className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ userId, userEmail, onDone }: { userId: string; userEmail: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const deleteFn = useServerFn(deleteUserAdmin);
  const mut = useMutation({
    mutationFn: () => deleteFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso!");
      setOpen(false);
      onDone();
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Excluir Usuário
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir permanentemente o usuário <strong>{userEmail}</strong>? 
            Esta ação não pode ser desfeita e removerá todos os dados vinculados (assinaturas, créditos, etc).
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" className="flex-1" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Excluindo..." : "Excluir Permanentemente"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditClientDialog({ user, onDone, isAdminUser, onToggleAdmin }: { user: AdminUser; onDone: () => void; isAdminUser?: boolean; onToggleAdmin?: (userId: string, makeAdmin: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(user.full_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [password, setPassword] = useState("");

  // Update state when user changes or dialog opens
  useEffect(() => {
    if (open) {
      setFullName(user.full_name || "");
      setEmail(user.email || "");
      setPassword("");
    }
  }, [open, user]);
  
  const updateFn = useServerFn(updateClientAdmin);
  const mut = useMutation({
    mutationFn: () => updateFn({ data: { 
      userId: user.id, 
      fullName, 
      email, 
      password: password || undefined 
    } }),
    onSuccess: () => {
      toast.success("Dados do cliente atualizados!");
      setOpen(false);
      onDone();
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
          <DialogDescription>
            Alterar dados de {user.email}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nova Senha (deixe em branco para manter)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {onToggleAdmin && (
            <div className="rounded-md border p-3 bg-muted/30 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Tipo de Conta</div>
                <div className="text-sm font-medium">{isAdminUser ? "Administrador" : "Cliente"}</div>
              </div>
              <Button 
                size="sm" 
                variant={isAdminUser ? "destructive" : "default"}
                onClick={() => onToggleAdmin(user.id, !isAdminUser)}
              >
                {isAdminUser ? "Remover Admin" : "Tornar Admin"}
              </Button>
            </div>
          )}

          <Button className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-add Label import if missing
import { Label } from "@/components/ui/label";
