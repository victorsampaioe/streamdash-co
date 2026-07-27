import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, LayoutDashboard, ServerIcon, Bell, Users, LogOut, Sun, Moon, Search, Plus, CreditCard, Gift, Radio, ShieldAlert, Trophy, Lock } from "lucide-react";
import { SubscriptionBanner } from "@/components/subscription/subscription-banner";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

// Routes that keep working even after the subscription expires,
// so the user can always renew and see their status.
const ALWAYS_OPEN_PATHS = [
  "/app/subscription",
  "/app/referrals",
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <SubscriptionBanner />
        <main className="flex-1 p-6 md:p-8 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

function GatedOutlet() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data, isLoading } = useSubscription();
  const allowed = ALWAYS_OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isLoading || data?.isActive || allowed) return <Outlet />;
  return (
    <Card className="p-10 border-dashed text-center space-y-4 max-w-xl mx-auto mt-8">
      <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-6 w-6 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-xl font-semibold">Assinatura expirada</h3>
        <p className="text-sm text-muted-foreground mt-2">
          Seu período gratuito ou plano acabou. As funções ficam bloqueadas até a renovação
          via PIX. O monitoramento dos seus servidores também está pausado.
        </p>
      </div>
      <Link to="/app/subscription">
        <Button size="lg"><CreditCard className="h-4 w-4 mr-2" />Renovar por PIX</Button>
      </Link>
    </Card>
  );
}

export function AppOutletShell() {
  return <AppShell><GatedOutlet /></AppShell>;
}


function Sidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const items = [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/app/servers", label: "Servidores", icon: ServerIcon },
    { to: "/app/alerts", label: "Alertas", icon: Bell },
    { to: "/app/radar", label: "Radar Brasil", icon: Radio },
    { to: "/app/detector", label: "Detector", icon: ShieldAlert },
    { to: "/app/ranking", label: "Ranking", icon: Trophy },
    { to: "/app/subscription", label: "Assinatura", icon: CreditCard },
    { to: "/app/referrals", label: "Indicações", icon: Gift },
  ];

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-border/60 bg-sidebar text-sidebar-foreground">
      <div className="p-5 flex items-center gap-2 border-b border-sidebar-border">
        <Activity className="h-5 w-5 text-primary" />
        <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
      </div>
      <nav className="p-3 space-y-1 flex-1">
        {items.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          return (
            <Link key={it.to} to={it.to} className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50"
            )}>
              <it.icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link to="/app/admin" className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/app/admin") ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50"
          )}>
            <Users className="h-4 w-4" />
            Admin
          </Link>
        )}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <SignOutButton />
      </div>
    </aside>
  );
}

function Topbar() {
  const { theme, toggle } = useTheme();
  return (
    <header className="h-14 border-b border-border/60 flex items-center justify-between px-6 bg-background/70 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-2 md:hidden">
        <Activity className="h-5 w-5 text-primary" />
        <span className="font-bold">streammonitor</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <Link to="/app/servers/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo servidor</Button></Link>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
      <LogOut className="h-4 w-4 mr-2" /> Sair
    </Button>
  );
}

// Small helper so pages don't reimplement search input
export function SearchInput({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-3 h-9 rounded-md bg-input border border-border w-full sm:w-64 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
