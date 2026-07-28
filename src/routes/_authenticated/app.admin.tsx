import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  XCircle,
} from "lucide-react";
import { formatBRL } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { broadcastTelegram } from "@/lib/telegram-broadcast.functions";

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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const statsQ = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_stats");
      if (error) throw error;
      return data as unknown as StatsRow;
    },
  });

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_users");
      if (error) throw error;
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

      {/* Users table */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Usuários cadastrados</h2>
            <Badge variant="outline">{filtered.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input placeholder="Buscar por nome, e-mail, telefone..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-72" />
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
                      <Button size="sm" variant={u.is_admin ? "outline" : "default"} onClick={() => toggleAdmin.mutate({ userId: u.id, makeAdmin: !u.is_admin })}>
                        {u.is_admin ? "Remover admin" : "Tornar admin"}
                      </Button>
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
      <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex justify-end">
        <Button onClick={() => mut.mutate(message)} disabled={mut.isPending || !message.trim()}>
          <Send className="h-4 w-4 mr-2" />
          {mut.isPending ? "Enviando..." : "Enviar para todos"}
        </Button>
      </div>
    </Card>
  );
}
