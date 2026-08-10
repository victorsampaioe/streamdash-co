import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { Globe, Lock, Search, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute('/monitoramento-dns')({
  head: () => ({
    meta: [
      { title: "Monitoramento DNS e SSL em Tempo Real - Stream Monitor" },
      { name: "description", content: "Evite que seu domínio fique fora do ar. Monitoramento de DNS, mudanças de IP e expiração de certificados SSL." },
      { property: "og:title", content: "Monitoramento DNS e SSL 🌐" },
    ],
  }),
  component: DnsPage,
});

function DnsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">Monitoramento DNS e Segurança</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Domínios fora do ar ou certificados SSL expirados são os principais causadores de perdas de clientes em serviços de streaming.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="text-primary" /> Detecção de Queda
            </h2>
            <p className="text-muted-foreground">Monitoramos se o seu domínio está resolvendo corretamente para o IP esperado e te avisamos se houver falha de propagação.</p>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Search className="text-primary" /> Mudança de IP
            </h2>
            <p className="text-muted-foreground">Se o seu servidor mudar de endereço sem você saber, o Stream Monitor detecta a divergência e alerta instantaneamente.</p>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Lock className="text-primary" /> Alerta SSL
            </h2>
            <p className="text-muted-foreground">Nunca mais deixe um certificado expirar. Receba avisos com 7, 3 e 1 dia de antecedência.</p>
          </div>
        </div>

        <div className="bg-card/50 rounded-2xl p-8 border border-border/60 mb-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Proteja seus domínios hoje mesmo</h2>
          <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
        </div>
      </div>
    </div>
  );
}
