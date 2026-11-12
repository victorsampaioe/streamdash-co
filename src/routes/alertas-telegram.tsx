import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { Send, Bell, Zap, MessageSquare } from "lucide-react";

export const Route = createFileRoute('/alertas-telegram')({
  head: () => ({
    meta: [
      { title: "Alertas de Queda IPTV no Telegram | Stream Monitor" },
      { name: "description", content: "Receba alertas de quedas confirmadas e recuperação dos servidores IPTV no Telegram. Saiba como o monitoramento reduz alarmes falsos." },
      { property: "og:title", content: "Alertas de queda IPTV no Telegram | Stream Monitor" },
      { property: "og:description", content: "Avisos no Telegram quando uma queda é confirmada e quando o servidor IPTV volta ao ar." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site/alertas-telegram" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://streammonitor.site/alertas-telegram" }],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">Alertas Automáticos no Telegram</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Configure notificações para acompanhar falhas confirmadas, instabilidade e recuperação dos servidores monitorados.
        </p>

        <div className="space-y-12 mb-16">
          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Send className="text-primary" /> Por que o Telegram?
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Diferente do e-mail, o Telegram possui notificações push instantâneas e permite a criação de bots dedicados que podem ser configurados em grupos de suporte ou canais privados.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="text-primary" /> Alertas com contexto da falha
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Os alertas podem mostrar qual servidor apresentou problema e informações de diagnóstico. O envio depende da configuração do bot, da confirmação da falha e da disponibilidade do Telegram.
            </p>
          </section>

          <section className="bg-card/40 border border-border/60 rounded-xl p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2 italic">Exemplo de Notificação:</h3>
            <div className="bg-[#1c242d] p-4 rounded-lg text-sm font-mono text-white/90 space-y-2 max-w-sm">
              <p>🚨 <b>OFFLINE CONFIRMADO</b></p>
              <p>Servidor: Painel IPTV Principal</p>
              <p>Motivo: Timeout (8s)</p>
              <p>🌎 Região: São Paulo</p>
            </div>
          </section>
        </div>

        <section className="mb-12 space-y-3 rounded-2xl border border-border/60 bg-card/40 p-6">
          <h2 className="text-2xl font-bold">Quando o alerta é enviado?</h2>
          <p className="text-muted-foreground">Uma única falha de rede pode ser temporária. O monitoramento utiliza novas verificações para reduzir falsos positivos antes de sinalizar a indisponibilidade. O tempo do aviso depende do intervalo de monitoramento, das confirmações e da entrega pelo Telegram.</p>
          <p className="text-muted-foreground">Saiba <Link to="/blog/como-saber-se-servidor-iptv-caiu" className="text-primary underline">como identificar se um servidor IPTV realmente caiu</Link>.</p>
        </section>
        <div className="bg-card/50 rounded-2xl p-8 border border-border/60 mb-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Configure seus alertas agora</h2>
          <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
        </div>
      </div>
    </main>
  );
}
