import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { Send, Bell, Zap, MessageSquare } from "lucide-react";

export const Route = createFileRoute('/alertas-telegram')({
  head: () => ({
    meta: [
      { title: "Alertas no Telegram: Como Funciona - Stream Monitor" },
      { name: "description", content: "Receba notificações instantâneas de queda no seu celular. Configure alertas no Telegram em menos de 1 minuto." },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">Alertas Automáticos no Telegram</h1>
        <p className="text-xl text-muted-foreground mb-12">
          A forma mais rápida e eficiente de ser avisado sobre problemas na sua infraestrutura.
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

        <div className="bg-card/50 rounded-2xl p-8 border border-border/60 mb-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Configure seus alertas agora</h2>
          <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
        </div>
      </div>
    </div>
  );
}
