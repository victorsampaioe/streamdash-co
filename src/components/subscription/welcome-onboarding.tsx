import { Link } from "@tanstack/react-router";
import { Gem, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Tela de boas-vindas exibida no primeiro acesso, quando a conta ainda não
 * possui nenhuma assinatura. O acesso operacional é liberado apenas após o pagamento.
 */
export function WelcomeOnboarding() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-8 py-12">
      <div className="text-center space-y-2">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 border border-primary/30">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">🎉 Bem-vindo ao Stream Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta foi criada com sucesso. Para começar a monitorar seus servidores e utilizar todas as ferramentas, escolha um plano abaixo.
        </p>
      </div>

      <div className="grid gap-4">
        <Card className="p-8 flex flex-col gap-6 border-primary/60 ring-1 ring-primary/30 shadow-xl bg-gradient-to-b from-primary/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/20">
              <Gem className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Ativar Minha Conta</h2>
              <p className="text-sm text-muted-foreground">Liberação instantânea após a confirmação do PIX.</p>
            </div>
          </div>
          
          <ul className="space-y-3 text-sm text-muted-foreground">
            {[
              "Monitoramento profissional em tempo real",
              "DNS, SSL e IPTV Intelligence",
              "Alertas automáticos via Telegram",
              "Relatórios de instabilidade e Uptime",
              "Hub de revendedores e rede multinível"
            ].map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <Link to="/app/subscription" className="w-full pt-4">
            <Button className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20">
              <Gem className="h-5 w-5 mr-2" />
              Escolher Meu Plano
            </Button>
          </Link>
          
          <p className="text-xs text-muted-foreground text-center">
            Pague via PIX e comece a usar em menos de 1 minuto.
          </p>
        </Card>
      </div>
    </div>
  );
}
