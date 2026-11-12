import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { Users, CreditCard, TrendingUp, DollarSign } from "lucide-react";

export const Route = createFileRoute('/revendedor-stream-monitor')({
  head: () => ({
    meta: [
      { title: "Revenda IPTV: Monitoramento para Revendedores | Stream Monitor" },
      { name: "description", content: "Revenda IPTV com monitoramento profissional: controle de servidores, alertas de instabilidade, DNS e gerenciamento de clientes. Conheça o Stream Monitor." },
      { property: "og:title", content: "Seja Revendedor Stream Monitor | Sistema de Monitoramento IPTV" },
      { property: "og:description", content: "Revenda uma plataforma profissional de monitoramento IPTV e ofereça tecnologia para seus clientes." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site/revendedor-stream-monitor" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://streammonitor.site/revendedor-stream-monitor" }],
  }),
  component: ResellerPage,
});

function ResellerPage() {
  return (
    <main className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">Revenda IPTV com monitoramento Stream Monitor</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Para quem trabalha com revenda IPTV: ofereça monitoramento de servidores, DNS, histórico de incidentes e alertas para uma operação de revenda mais organizada.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="p-6 bg-card/40 border border-border/60 rounded-2xl">
            <CreditCard className="text-primary h-10 w-10 mb-4" />
            <h2 className="text-xl font-bold mb-2">Sistema de Créditos</h2>
            <p className="text-muted-foreground text-sm">Adquira pacotes de créditos com desconto progressivo e utilize-os para ativar clientes ou sub-revendedores.</p>
          </div>
          <div className="p-6 bg-card/40 border border-border/60 rounded-2xl">
            <TrendingUp className="text-primary h-10 w-10 mb-4" />
            <h2 className="text-xl font-bold mb-2">Painel Multi-nível</h2>
            <p className="text-muted-foreground text-sm">Gerencie toda a sua árvore de revendedores em uma interface intuitiva, com controle total sobre saldos e permissões.</p>
          </div>
          <div className="p-6 bg-card/40 border border-border/60 rounded-2xl">
            <Users className="text-primary h-10 w-10 mb-4" />
            <h2 className="text-xl font-bold mb-2">Monitoramento e Alertas</h2>
            <p className="text-muted-foreground text-sm">Acompanhe DNS, disponibilidade e falhas e configure alertas para cada operação, sem depender de consultas manuais.</p>
          </div>
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-8 mb-16 text-center">
          <h2 className="text-3xl font-bold mb-6">Vantagens para Revendedores</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
            <div className="font-semibold">Preços Diferenciados</div>
            <div className="font-semibold">Alertas pelo Telegram</div>
            <div className="font-semibold">Páginas Personalizadas</div>
            <div className="font-semibold">Marca Branca (opcional)</div>
            <div className="font-semibold">Histórico de Incidentes</div>
            <div className="font-semibold">API para Integração</div>
          </div>
        </div>

        <section className="mb-14 rounded-2xl border border-border/60 bg-card/40 p-6 space-y-4">
          <h2 className="text-2xl font-bold">Por que revendedores precisam monitorar seus DNS?</h2>
          <p className="text-muted-foreground">Quando muitos clientes relatam instabilidade ao mesmo tempo, ter dados sobre DNS, HTTP e incidentes reduz a necessidade de testar cada domínio manualmente. Acompanhar o histórico também ajuda a distinguir problemas transitórios de falhas persistentes.</p>
          <p className="text-muted-foreground">Conheça o <Link to="/monitoramento-iptv" className="text-primary underline">monitoramento de servidores IPTV</Link>, veja as <Link to="/alertas-telegram" className="text-primary underline">notificações pelo Telegram</Link> e explore nossos <Link to="/blog" className="text-primary underline">guias técnicos</Link>.</p>
        </section>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Inicie sua revenda hoje</h2>
          <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
        </div>
      </div>
    </main>
  );
}
