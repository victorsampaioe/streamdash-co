import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Rocket, Gem, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSubscription } from "@/hooks/use-subscription";

/**
 * Tela de boas-vindas exibida no primeiro acesso, quando a conta ainda não
 * possui nenhuma assinatura (nem teste). O teste de 1 dia só existe para contas
 * criadas com um código de indicação válido (validado no backend). Sem código,
 * o acesso é liberado apenas após o pagamento.
 */
export function WelcomeOnboarding() {
  const { refetch } = useSubscription();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [canTrial, setCanTrial] = useState<boolean | null>(null);
  const [trialUsed, setTrialUsed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("referred_by, trial_used")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (active) {
        setTrialUsed(!!data?.trial_used);
        setCanTrial(!!data?.referred_by && !data?.trial_used);
      }
    })();
    return () => { active = false; };
  }, []);

  async function startTrial() {
    setLoading(true);
    const { error } = await supabase.rpc("activate_free_trial" as never);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Teste gratuito de 1 dia ativado! Aproveite todos os recursos.");
    await refetch();
    navigate({ to: "/app" });
  }


  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 py-6">
      <div className="text-center space-y-2">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 border border-primary/30">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">🎉 Bem-vindo ao Stream Monitor</h1>
        <p className="text-sm text-muted-foreground">
          {canTrial === false
            ? "Sua conta foi criada sem código de indicação — o acesso é liberado após o pagamento."
            : "Seu cadastro foi realizado com sucesso. Agora escolha como deseja começar:"}
        </p>
      </div>

      <div className={canTrial === false ? "grid gap-4 max-w-md mx-auto" : "grid gap-4 md:grid-cols-2"}>
        {canTrial !== false && (
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">🚀 Teste Gratuito</h2>
              <p className="text-xs text-muted-foreground">Experimente todos os recursos por 1 dia, sem custo.</p>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground flex-1">
            {["Monitoramento completo", "DNS e IPTV Intelligence", "Alertas em tempo real"].map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {p}
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" onClick={startTrial} disabled={loading || canTrial === null}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
            Iniciar Teste
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Disponível apenas uma vez por conta, com código de indicação.
          </p>
        </Card>
        )}


        <Card className="p-6 flex flex-col gap-4 border-primary/60 ring-1 ring-primary/30">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15">
              <Gem className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">💎 Assinar Agora</h2>
              <p className="text-xs text-muted-foreground">Acesso completo, ativado na hora após o PIX.</p>
            </div>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground flex-1">
            {["Sem interrupções", "Suporte prioritário", "Economia no plano anual"].map((p) => (
              <li key={p} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {p}
              </li>
            ))}
          </ul>
          <Link to="/app/subscription" className="w-full">
            <Button className="w-full">
              <Gem className="h-4 w-4 mr-2" />
              Escolher Plano
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
