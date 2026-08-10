import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { Users, CreditCard, TrendingUp, DollarSign } from "lucide-react";

export const Route = createFileRoute('/revendedor-stream-monitor')({
  head: () => ({
    meta: [
      { title: "Seja um Revendedor Stream Monitor - Ganhe Dinheiro" },
      { name: "description", content: "Crie sua própria rede de monitoramento. Sistema de créditos para revendedores com margem de lucro agressiva." },
    ],
  }),
  component: ResellerPage,
});

function ResellerPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">Ganhe revendendo o Stream Monitor</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Transforme o monitoramento de infraestrutura em uma fonte de renda recorrente para o seu negócio.
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
        </div>

        <div className="bg-primary/10 border border-primary/20 rounded-2xl p-8 mb-16 text-center">
          <h2 className="text-3xl font-bold mb-6">Vantagens para Revendedores</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 text-sm">
            <div className="font-semibold">Preços Diferenciados</div>
            <div className="font-semibold">Suporte Prioritário</div>
            <div className="font-semibold">Páginas Personalizadas</div>
            <div className="font-semibold">Marca Branca (opcional)</div>
            <div className="font-semibold">Relatórios em PDF</div>
            <div className="font-semibold">API para Integração</div>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Inicie sua revenda hoje</h2>
          <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
        </div>
      </div>
    </div>
  );
}
