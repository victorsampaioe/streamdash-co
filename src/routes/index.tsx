import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Bell, Globe, Zap, ShieldCheck, LineChart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportFab } from "@/components/support-fab";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stream Monitor - Monitoramento IPTV, DNS e Servidores em Tempo Real" },
      { name: "description", content: "Monitore servidores IPTV, DNS e infraestrutura em tempo real. Receba alertas no Telegram antes dos seus clientes perceberem problemas." },
      { property: "og:title", content: "Stream Monitor 🚀" },
      { property: "og:description", content: "Monitoramento inteligente IPTV, DNS e servidores em tempo real." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
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
            Seu servidor IPTV caiu?<br />
            <span className="text-primary">Descubra antes dos seus clientes.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10">
            Monitoramento inteligente de IPTV, DNS e servidores com alertas automáticos no Telegram.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth"><Button size="lg" className="glow-primary">✅ Testar sistema</Button></Link>
            <Link to="/auth"><Button size="lg" variant="outline">✅ Seja revendedor</Button></Link>
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
        <h2 className="text-3xl font-bold text-center mb-12">Por que usar o Stream Monitor?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Feature icon={<Zap className="h-5 w-5" />} title="✅ Monitoramento 24 horas" desc="DNS, HTTP, latência e certificado SSL conferidos sem parar, de várias regiões." />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} title="✅ Inteligência de diagnóstico" desc="Sistema anti-falso positivo com burst de confirmação e análise detalhada de falhas." />
          <Feature icon={<Bell className="h-5 w-5" />} title="✅ Alertas Telegram" desc="Receba notificações instantâneas no seu Telegram antes dos seus clientes perceberem." />
          <Feature icon={<Activity className="h-5 w-5" />} title="✅ Monitoramento IPTV real" desc="Monitoramento dedicado de painéis IPTV com Health Score exclusivo e verificação de fluxo." />
          <Feature icon={<Globe className="h-5 w-5" />} title="✅ Análise de conteúdo" desc="Acompanhe conteúdos recentes e status de servidores IPTV com integração TMDB." />
          <Feature icon={<LineChart className="h-5 w-5" />} title="✅ Sistema para revendedores" desc="Estrutura completa para gerenciar sub-revendas com sistema de créditos independente." />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="text-3xl font-bold text-center mb-12">Prova Social</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          <Stat label="Servidores monitorados" value="1.240+" />
          <Stat label="Checagens realizadas" value="4.5M+" />
          <Stat label="Alertas enviados" value="850k+" />
          <Stat label="Revendedores ativos" value="320+" />
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-t border-border/60">
        <h2 className="text-3xl font-bold text-center mb-12 text-primary">Perguntas Frequentes (FAQ)</h2>
        <div className="space-y-6">
          <FaqItem question="Como funciona o Stream Monitor?" answer="O Stream Monitor vigia seus servidores a cada 30 segundos de múltiplas regiões globais. Se houver qualquer instabilidade, você é avisado instantaneamente no Telegram." />
          <FaqItem question="Ele monitora IPTV automaticamente?" answer="Sim! Temos um módulo exclusivo para IPTV que verifica o status do painel, fluxos, latência e gera um Health Score de 0 a 100%." />
          <FaqItem question="Recebo alerta quando o servidor cai?" answer="Com certeza. O alerta é enviado em segundos após a confirmação da queda via Telegram, Discord, e-mail ou Webhook." />
          <FaqItem question="Posso usar para minha revenda?" answer="Sim, o sistema foi projetado para revendas. Você pode inclusive criar páginas públicas de status para seus próprios clientes." />
          <FaqItem question="Como virar revendedor?" answer="Basta se cadastrar e adquirir um pacote de créditos. Com os créditos, você pode criar e gerenciar sub-revendedores de forma totalmente independente." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-3">Pronto para profissionalizar sua operação?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Junte-se a centenas de revendedores que não perdem mais tempo respondendo reclamação de queda.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/auth"><Button size="lg" className="glow-primary">Criar minha conta grátis</Button></Link>
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="gap-2">
                <Send className="h-4 w-4" />Canal de Novidades
              </Button>
            </a>
          </div>
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


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-primary mb-1">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-6">
      <h3 className="font-bold mb-2 flex items-center gap-2 text-primary">
        <span className="h-2 w-2 rounded-full bg-primary" />
        {question}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{answer}</p>
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
