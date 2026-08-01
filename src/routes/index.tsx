import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Bell, Globe, Zap, ShieldCheck, LineChart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportFab } from "@/components/support-fab";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StreamMonitor — Descubra a queda antes do seu cliente" },
      { name: "description", content: "Plataforma premium de monitoramento para revendas e provedores: uptime, latência, DNS, SSL e IPTV vigiados 24/7 com alerta imediato no Telegram, Discord, e-mail e webhook." },
      { property: "og:title", content: "StreamMonitor — Descubra a queda antes do seu cliente" },
      { property: "og:description", content: "Monitoramento 24/7 de uptime, DNS, SSL e IPTV com alertas instantâneos e página pública de status para seus clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
            Monitoramento ativo a cada 30 segundos
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-6 break-words">
            Evite descobrir uma queda<br />
            <span className="text-primary">pelo seu cliente.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10">
            O StreamMonitor vigia seus servidores, DNS, certificados e painéis IPTV 24 horas por dia
            e te avisa no Telegram em segundos — antes que o suporte encha de mensagem.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
            <a href="#recursos"><Button size="lg" variant="outline">Ver recursos</Button></a>
          </div>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { k: "30s", v: "Intervalo de checagem" },
              { k: "4", v: "Regiões globais" },
              { k: "< 1 min", v: "Alerta após a falha" },
              { k: "24/7", v: "Vigilância contínua" },
            ].map((m) => (
              <div key={m.v} className="rounded-xl border border-border/60 bg-card/50 px-4 py-3">
                <div className="text-xl font-bold text-primary">{m.k}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="recursos" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid md:grid-cols-3 gap-6">
          <Feature icon={<Zap className="h-5 w-5" />} title="Vigilância a cada 30s" desc="DNS, HTTP, latência e certificado SSL conferidos sem parar, de várias regiões." />
          <Feature icon={<Bell className="h-5 w-5" />} title="Alerta antes da reclamação" desc="Telegram, Discord, e-mail e webhook disparados no primeiro sinal de instabilidade." />
          <Feature icon={<LineChart className="h-5 w-5" />} title="Histórico que prova" desc="Gráficos de disponibilidade, incidentes documentados e exportação em CSV." />
          <Feature icon={<Globe className="h-5 w-5" />} title="Status page da sua marca" desc="Uma página pública elegante para tranquilizar clientes durante um incidente." />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Segurança de verdade" desc="Credenciais criptografadas, logs sem dados sensíveis e bloqueio anti força bruta." />
          <Feature icon={<Activity className="h-5 w-5" />} title="Inteligência IPTV" desc="Player API, playlist, canais, VOD e séries monitorados com health score." />
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

      <SupportFab />
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
