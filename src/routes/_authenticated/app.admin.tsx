import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { adminListPayoutRequests, adminApprovePayout, adminMarkPayoutPaid, adminRejectPayout } from "@/lib/referrals.functions";
import { StorageReportCard } from "@/components/storage-report-card";
import { AlertCircle } from "lucide-react";


export const Route = createFileRoute("/_authenticated/app/admin")({
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
  plan: "trial" | "monthly" | "yearly" | null;
  status: "trial" | "active" | "expired" | "cancelled" | null;
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
  total_referrals: number;
  converted_referrals: number;
};

type FilterKey = "all" | "paid" | "trial" | "expired" | "admin";

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




  const statsQ = useQuery({
    queryKey: ["admin-stats"],
    enabled: isAdmin,
    retry: 1,
    queryFn: async () => {
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
      const { data, error } = await supabase.rpc("get_admin_users");
      if (error) {
        console.error("Admin users error:", error);
        throw error;
      }
      return (data ?? []) as AdminUser[];
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

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Usuários totais" value={s?.total_users} tone="primary" sub={s ? `+${s.new_users_7d} nos últimos 7 dias` : undefined} />
        <Kpi icon={BadgeCheck} label="Assinantes ativos" value={s?.paid_active} tone="success" sub={s ? `${s.monthly_subs} mensal · ${s.yearly_subs} anual` : undefined} />
        <Kpi icon={Gift} label="Em teste grátis" value={s?.trial_active} tone="warning" />
        <Kpi icon={XCircle} label="Expirados" value={s?.expired} tone="destructive" sub={s ? `${s.expiring_7d} vencem em 7 dias` : undefined} />
        <Kpi icon={CircleDollarSign} label="Receita 30 dias" value={s ? formatBRL(s.revenue_cents_30d) : undefined} tone="success" sub={s ? `${formatBRL(s.revenue_cents_7d)} nos últimos 7d` : undefined} />
        <Kpi icon={TrendingUp} label="Receita total" value={s ? formatBRL(s.revenue_cents_total) : undefined} tone="primary" sub={s ? `${s.payments_approved_total} pagamentos` : undefined} />
        <Kpi icon={UserPlus} label="Indicações" value={s?.total_referrals} sub={s ? `${s.converted_referrals} convertidas` : undefined} />
        <Kpi icon={ServerCog} label="Servidores monitorados" value={s?.total_servers} />
      </div>

      <TelegramBroadcastCard />

      <PayoutsCard />

      <StorageReportCard />



      {/* Users table */}
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
              <Input placeholder="Buscar por nome, e-mail, telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-full" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>Todos</FilterChip>
          <FilterChip active={filter === "paid"} onClick={() => setFilter("paid")} tone="success">Pagantes ativos</FilterChip>
          <FilterChip active={filter === "trial"} onClick={() => setFilter("trial")} tone="warning">Em teste</FilterChip>
          <FilterChip active={filter === "expired"} onClick={() => setFilter("expired")} tone="destructive">Expirados</FilterChip>
          <FilterChip active={filter === "admin"} onClick={() => setFilter("admin")} tone="primary">Admins</FilterChip>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Usuário</th>
                <th className="text-left p-3 font-medium">Plano</th>
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
                    <td className="p-3"><PlanBadge plan={u.plan} /></td>
                    <td className="p-3"><StatusBadge status={u.status} expired={expired} /></td>
                    <td className="p-3">
                      <div className={cn("text-xs flex items-center gap-1", expired && "text-destructive", expiringSoon && "text-warning")}>
                        <CalendarClock className="h-3 w-3" />
                        {u.expires_at ? new Date(u.expires_at).toLocaleDateString("pt-BR") : "—"}
                      </div>
                      {u.days_remaining !== null && !expired && (
                        <div className="text-[10px] text-muted-foreground">{u.days_remaining} dia(s)</div>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      {u.total_paid_cents > 0 ? formatBRL(u.total_paid_cents) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <GrantPlanDialog user={u} />
                        <Button size="sm" variant={u.is_admin ? "outline" : "default"} onClick={() => toggleAdmin.mutate({ userId: u.id, makeAdmin: !u.is_admin })}>
                          {u.is_admin ? "Remover admin" : "Tornar admin"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
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
  const map = {
    trial: { label: "Teste", cls: "border-warning/40 text-warning" },
    monthly: { label: "Mensal", cls: "border-primary/40 text-primary" },
    yearly: { label: "Anual", cls: "border-success/40 text-success" },
  } as const;
  const m = map[plan];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

function StatusBadge({ status, expired }: { status: AdminUser["status"]; expired: boolean }) {
  if (expired) return <Badge variant="destructive">Expirado</Badge>;
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map = {
    trial: <Badge variant="outline" className="border-warning/40 text-warning"><Gift className="h-3 w-3 mr-1" />Em teste</Badge>,
    active: <Badge className="bg-success text-success-foreground"><Activity className="h-3 w-3 mr-1" />Ativo</Badge>,
    expired: <Badge variant="destructive">Expirado</Badge>,
    cancelled: <Badge variant="outline">Cancelado</Badge>,
  } as const;
  return map[status];
}

function TelegramBroadcastCard() {
  const [message, setMessage] = useState("✅ StreamMonitor está online! Todas as suas monitorações estão sendo executadas normalmente.");
  const PROMO_MSG = "🔥 <b>PROMOÇÃO RELÂMPAGO — SÓ HOJE!</b>\n\nPlano <b>MENSAL</b> por apenas <b>R$ 25,00</b> (de R$ 35,00).\n\n⏰ Amanhã volta ao valor normal.\n\n👉 Assine agora pelo PIX: https://streammonitor.site/app/subscription";
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
          🔥 Usar mensagem da promoção anual
        </Button>
        <Button onClick={() => mut.mutate(message)} disabled={mut.isPending || !message.trim()}>
          <Send className="h-4 w-4 mr-2" />
          {mut.isPending ? "Enviando..." : "Enviar para todos"}
        </Button>
      </div>
    </Card>
  );
}

type PayoutReq = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  user_phone: string | null;
  amount_cents: number;
  pix_type: string;
  pix_key: string;
  pix_name: string;
  status: "requested" | "approved" | "paid" | "rejected";
  admin_note: string | null;
  requested_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  referral_count: number;
};

function PayoutsCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPayoutRequests);
  const approveFn = useServerFn(adminApprovePayout);
  const paidFn = useServerFn(adminMarkPayoutPaid);
  const rejectFn = useServerFn(adminRejectPayout);

  const q = useQuery({
    queryKey: ["admin-payouts"],
    retry: 1,
    queryFn: async () => {
      const data = await listFn();
      return data;
    },
  });

  const rows = (q.data ?? []) as PayoutReq[];
  const kpi = useMemo(() => ({
    requested: rows.filter((r) => r.status === "requested").length,
    approved: rows.filter((r) => r.status === "approved").length,
    paid: rows.filter((r) => r.status === "paid").length,
    total_paid_cents: rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_cents, 0),
  }), [rows]);

  const mut = useMutation({
    mutationFn: async ({ action, id, note }: { action: "approve" | "paid" | "reject"; id: string; note?: string }) => {
      if (action === "approve") await approveFn({ data: { id } });
      else if (action === "paid") await paidFn({ data: { id } });
      else await rejectFn({ data: { id, note } });
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["admin-payouts"] });
      toast.success(v.action === "approve" ? "Aprovado" : v.action === "paid" ? "Marcado como pago" : "Recusado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4 border-primary/30">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Solicitações de PIX (Indicações)</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Send} label="Solicitados" value={kpi.requested} tone="warning" />
        <Kpi icon={BadgeCheck} label="Aprovados" value={kpi.approved} tone="primary" />
        <Kpi icon={CircleDollarSign} label="Pagos" value={kpi.paid} tone="success" />
        <Kpi icon={TrendingUp} label="Total pago" value={formatBRL(kpi.total_paid_cents)} tone="success" />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Usuário</th>
              <th className="text-left p-3 font-medium">Indic.</th>
              <th className="text-right p-3 font-medium">Valor</th>
              <th className="text-left p-3 font-medium">PIX</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {!q.isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma solicitação de PIX ainda.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20 align-top">
                <td className="p-3">
                  <div className="font-medium">{r.user_name ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{r.user_email}</div>
                  {r.user_phone && <div className="text-[11px] text-muted-foreground">{r.user_phone}</div>}
                </td>
                <td className="p-3 text-center">{r.referral_count}</td>
                <td className="p-3 text-right font-mono">{formatBRL(r.amount_cents)}</td>
                <td className="p-3 text-xs">
                  <div className="font-medium uppercase">{r.pix_type}</div>
                  <div className="font-mono">{r.pix_key}</div>
                  <div className="text-muted-foreground">{r.pix_name}</div>
                </td>
                <td className="p-3"><PayoutBadge status={r.status} /></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(r.requested_at).toLocaleDateString("pt-BR")}</td>
                <td className="p-3 text-right space-x-1">
                  {r.status === "requested" && (
                    <>
                      <Button size="sm" onClick={() => mut.mutate({ action: "approve", id: r.id })}>Aprovar</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        const note = prompt("Motivo da recusa (opcional):") ?? undefined;
                        mut.mutate({ action: "reject", id: r.id, note });
                      }}>Recusar</Button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <Button size="sm" onClick={() => mut.mutate({ action: "paid", id: r.id })}>Marcar como pago</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PayoutBadge({ status }: { status: string }) {
  switch (status) {
    case "requested": return <Badge variant="outline" className="border-warning/40 text-warning">Solicitado</Badge>;
    case "approved": return <Badge variant="outline" className="border-primary/40 text-primary">Aprovado</Badge>;
    case "paid": return <Badge className="bg-success text-success-foreground">Pago</Badge>;
    case "rejected": return <Badge variant="destructive">Recusado</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
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
