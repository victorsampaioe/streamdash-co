import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Store, MessageSquare, Trophy, ShieldCheck, HelpCircle, Wrench, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hub")({
  head: () => ({
    meta: [
      { title: "Hub Stream — Comunidade Stream Monitor" },
      { name: "description", content: "Marketplace, serviços, parcerias e chat entre assinantes do Stream Monitor." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HubLayout,
});

const TABS = [
  { to: "/app/hub", label: "Vitrine", icon: Store, exact: true },
  { to: "/app/hub/demand", label: "Preciso de ajuda", icon: HelpCircle },
  { to: "/app/hub/services", label: "Serviços", icon: Wrench },
  { to: "/app/hub/ranking", label: "Ranking", icon: Trophy },
  { to: "/app/hub/messages", label: "Mensagens", icon: MessageSquare },
  { to: "/app/hub/verification", label: "Verificação", icon: ShieldCheck },
];

function HubLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Hub Stream</h1>
            <p className="text-sm text-muted-foreground">
              Marketplace, serviços e parcerias entre assinantes — chat protegido dentro da plataforma.
            </p>
          </div>
        </div>
      </header>

      <div className="border-b border-border overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-2 text-sm rounded-t-md border-b-2 -mb-px transition-colors whitespace-nowrap",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
