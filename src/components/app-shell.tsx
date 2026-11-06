import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, LayoutDashboard, ServerIcon, Bell, Users, LogOut, Sun, Moon, Search, Plus, CreditCard, Gift, Radio, ShieldAlert, Trophy, Lock, Menu, Send, Bot, Sparkles, BookOpen, Globe, ShoppingBag, Zap, Gauge, Braces } from "lucide-react";
import { SubscriptionBanner } from "@/components/subscription/subscription-banner";
import { TelegramBanner } from "@/components/telegram-banner";
import { WelcomeOnboarding } from "@/components/subscription/welcome-onboarding";



import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

// Routes that keep working even after the subscription expires,
// so the user can always renew and see their status.
const ALWAYS_OPEN_PATHS = [
  "/app/subscription",
  "/app/ai-integration",
  "/app/api-integrations",
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="sm-app-shell min-h-dvh flex min-w-0 bg-background text-foreground">
      <Sidebar />
      <div className="sm-app-body flex-1 flex flex-col min-w-0">
        <Topbar />
        <SubscriptionBanner />
        <TelegramBanner />
        <main id="main-content" className="sm-command-content flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-7 xl:px-10 xl:py-9 max-w-[1720px] w-full mx-auto">{children}</main>
      </div>
      
    </div>
  );
}


function GatedOutlet() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { data, isLoading, isError } = useSubscription();
  const { data: userRoles, isLoading: rolesLoading } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.user.id);
      return data?.map((r) => r.role as string) || [];
    },
  });
  const allowed = ALWAYS_OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Admin e revendedores nunca dependem de assinatura.
  const privileged = !!userRoles?.some((r) => r === "admin" || r === "reseller" || r === "sub_reseller");

  // On a failed status check, never block the user — just let the app render.
  if (isLoading || rolesLoading || isError || privileged || data?.isActive || allowed) return <Outlet />;
  
  // Resellers are handled by isActive: true in useSubscription, 
  // so if we are here, it's a Client.

  // Primeiro acesso: nunca teve assinatura nem teste → tela de boas-vindas.
  if (!data?.subscription) return <WelcomeOnboarding />;
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


function useNavItems() {
  const { data: subData } = useSubscription();
  
  const { data: userRoles } = useQuery({
    queryKey: ["user-roles"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.user.id);
      return data?.map(r => r.role) || [];
    },
  });

  // Confirme a autorização no servidor: não dependa apenas da leitura da tabela de papéis.
  // A rota protegida /app/admin continua validando o papel antes de liberar o acesso.
  const { data: navIsAdmin = false } = useQuery({
    queryKey: ["navigation-admin-access"],
    queryFn: async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return false;
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const isResellerRole = userRoles?.includes('reseller') || userRoles?.includes('sub_reseller');
  const isResellerOrAdmin = navIsAdmin || isResellerRole || !!subData?.profile?.is_reseller;

  const items = [
    ...(navIsAdmin ? [{ to: "/app/admin", label: "Admin · Central de controle", icon: Users }] : []),
    { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/app/servers", label: "Servidores", icon: ServerIcon },
    { to: "/app/central", label: "Central Inteligente", icon: ShieldAlert },
    { to: "/app/alerts", label: "Alertas", icon: Bell },
    { to: "/app/diagnostico", label: "Diagnóstico", icon: Activity },
    { to: "/app/radar", label: "Radar Brasil", icon: Radio },
    { to: "/app/detector", label: "Detector", icon: ShieldAlert },
    { to: "/app/inteligencia", label: "Inteligência de Conteúdo", icon: Sparkles },

    
    
    { to: "/app/ranking", label: "Ranking", icon: Trophy },
    { to: "/app/performance", label: "Performance", icon: Gauge },
    { to: "/app/achievements", label: "Conquistas", icon: Trophy },


  ];

  if (isResellerOrAdmin) {
    items.push({ to: "/app/reseller", label: "Painel Revendedor", icon: ShoppingBag });
    items.push({ to: "/app/pagina", label: "Minha Página", icon: Globe });
    items.push({ to: "/app/subscription", label: "Comprar Créditos", icon: CreditCard });
  } else {
    items.push({ to: "/app/subscription", label: "Minha Assinatura", icon: CreditCard });
  }
  
  items.push({ to: "/app/api-integrations", label: "API & Integrações", icon: Braces });
  items.push({ to: "/app/ai-integration", label: "Integração IA", icon: Bot });
  items.push({ to: "/app/ajuda", label: "Central de Ajuda", icon: BookOpen });

  return items;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const items = useNavItems();
  return (
    <nav className="sm-command-nav px-3 py-5 space-y-1 flex-1" aria-label="Navegação principal">
      {items.map((it) => {
        const active = (it as any).exact ? pathname === it.to : pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "sm-command-nav-item group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              active ? "bg-primary/15 text-primary font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-primary" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"
            )}
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar() {
  return (
    <aside className="sm-command-sidebar hidden lg:flex w-[272px] xl:w-[290px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20"><Activity className="h-5 w-5 text-primary" /></div>
        <div className="leading-tight"><div className="font-extrabold tracking-tight">stream<span className="text-primary">monitor</span></div><div className="text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/45">BLUE EDITION</div></div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <NavList />
      </div>
      <div className="p-4 border-t border-sidebar-border mt-auto space-y-2">
        <TelegramLink />
        <SignOutButton />
      </div>
    </aside>
  );
}

function TelegramLink() {
  return (
    <a
      href="https://t.me/+RId642Ac4AFkOWFh"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/50 transition-colors"
    >
      <Send className="h-4 w-4" /> Novidades no Telegram
    </a>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-sidebar text-sidebar-foreground flex flex-col h-full overflow-hidden">
        <SheetHeader className="p-5 border-b border-sidebar-border">
          <SheetTitle className="flex items-center gap-2 text-left">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
        <div className="p-3 border-t border-sidebar-border mt-auto space-y-1">
          <TelegramLink />
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Topbar() {
  const { theme, toggle } = useTheme();
  const { data: canOpenAdmin } = useQuery({
    queryKey: ["navigation-admin-access"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
    retry: 1,
  });
  return (
    <header className="sm-command-topbar min-h-[68px] border-b border-border/60 flex items-center gap-2 px-4 lg:px-8 bg-background/95 supports-[backdrop-filter]:bg-background/85 backdrop-blur-md sticky top-0 z-30">
      <MobileNav />
      <div className="flex items-center gap-2 lg:hidden min-w-0">
        <Activity className="h-5 w-5 text-primary shrink-0" />
        <span className="font-bold truncate">streammonitor</span>
      </div>
      <div className="hidden lg:flex flex-1 items-center gap-2 text-xs font-medium text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" /> Centro de operações <span className="mx-2 text-border">/</span> Stream Monitor</div>
      <div className="flex-1 lg:hidden" />
      <div className="flex items-center gap-1 sm:gap-2">
        {canOpenAdmin && <Link to="/app/admin" aria-label="Abrir painel administrativo">
          <Button size="sm" variant="outline" className="gap-1.5 border-primary/25 text-primary">
            <ShieldAlert className="h-4 w-4" /><span className="hidden sm:inline">Admin</span>
          </Button>
        </Link>}
        <Link to="/app/servers/new">
          <Button size="sm" className="px-2 sm:px-3">
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Novo servidor</span>
          </Button>
        </Link>
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
