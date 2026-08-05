import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSubscription } from "@/hooks/use-subscription";
/**
 * Wrap any premium feature. When the subscription is expired, the children
 * are replaced by a lock card with a "Renovar Assinatura" CTA.
 *
 * Usage:
 *   <PremiumGate>
 *     <ExpensiveReport />
 *   </PremiumGate>
 */
export function PremiumGate({ children, title = "Recurso premium" }) {
    const { data, isLoading } = useSubscription();
    if (isLoading)
        return <>{children}</>;
    if (data?.isActive)
        return <>{children}</>;
    return (<Card className="p-8 border-dashed text-center space-y-4">
      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-5 w-5 text-muted-foreground"/>
      </div>
      <div>
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Seu plano venceu. Renove para continuar utilizando o serviço.
        </p>
      </div>
      <Link to="/app/subscription">
        <Button>Renovar Assinatura</Button>
      </Link>
    </Card>);
}
