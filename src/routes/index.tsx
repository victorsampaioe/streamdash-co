import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Bell, Globe, Zap, ShieldCheck, LineChart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StreamMonitor — Monitoramento de infraestrutura em tempo real" },
      { name: "description", content: "Monitore uptime, latência, DNS e SSL dos seus servidores. Alertas por e-mail, Discord, Telegram e webhooks. Dashboard em tempo real." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur bg-background/70 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4 gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
          </div>
          <div className="flex items-center gap-2">
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex gap-2">
                <Send className="h-4 w-4" />Novidades
              </Button>
            </a>
            <Link to="/auth"><Button variant="ghost" size="sm">Entrar</Button></Link>
            <Link to="/auth"><Button size="sm">Começar</Button></Link>
          </div>

        </div>
      </header>

      <section className="grid-bg relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6 sm:mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Verificações a cada 30 segundos
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-6 break-words">
            Uptime, latência e SSL<br />
            <span className="text-primary">sem drama.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10">
            StreamMonitor observa seus servidores 24/7 e avisa por e-mail, Discord, Telegram
            ou webhook no primeiro sinal de problema.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth"><Button size="lg" className="glow-primary">Criar conta grátis</Button></Link>
            <a href="#recursos"><Button size="lg" variant="outline">Ver recursos</Button></a>
          </div>
        </div>
      </section>

      <section id="recursos" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid md:grid-cols-3 gap-6">
          <Feature icon={<Zap className="h-5 w-5" />} title="Verificação constante" desc="A cada 30s (configurável). DNS, HTTP, latência e certificado SSL." />
          <Feature icon={<Bell className="h-5 w-5" />} title="Alertas multicanal" desc="E-mail, Discord, Telegram e webhooks — após X falhas seguidas." />
          <Feature icon={<LineChart className="h-5 w-5" />} title="Dashboard em tempo real" desc="Gráficos de disponibilidade, histórico completo e exportação em CSV." />
          <Feature icon={<Globe className="h-5 w-5" />} title="Página pública de status" desc="Compartilhe o status dos seus serviços com seus clientes." />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Permissões finas" desc="Painel administrativo com controle de usuários e papéis." />
          <Feature icon={<Activity className="h-5 w-5" />} title="API e webhooks" desc="Integre com seu stack existente — REST e webhooks nativos." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-3">Acompanhe as novidades</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Entre no nosso canal do Telegram para receber alertas de status, novidades e dicas de monitoramento.
          </p>
          <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="outline" className="gap-2">
              <Send className="h-4 w-4" />Entrar no Telegram
            </Button>
          </a>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span>© {new Date().getFullYear()} streammonitor.site</span>
          <div className="flex items-center gap-4">
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-1.5">
              <Send className="h-4 w-4" />Novidades no Telegram
            </a>
            <Link to="/auth" className="hover:text-primary">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-6 hover:border-primary/50 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center text-primary mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
