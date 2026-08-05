import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock } from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";

/**
 * Shown at the top of the app when the subscription is close to expiring
 * or already expired. Silent when subscription is healthy.
 */
export function SubscriptionBanner() {
  const { data } = useSubscription();
  if (!data || !data.subscription || data.profile?.is_reseller) return null;

  if (data.isExpired) {
    return (
      <div className="border-b border-destructive/40 bg-destructive/10 text-destructive-foreground">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <p className="text-sm flex-1">
            Sua assinatura expirou. Os recursos premium estão bloqueados até a renovação.
          </p>
          <Link to="/app/subscription">
            <Button size="sm" variant="destructive">Renovar Assinatura</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (data.isExpiringSoon) {
    return (
      <div className="border-b border-warning/40 bg-warning/10">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-3 flex-wrap">
          <Clock className="h-4 w-4 text-warning" />
          <p className="text-sm flex-1">
            Sua assinatura vence em <strong>{data.daysRemaining} dia{data.daysRemaining === 1 ? "" : "s"}</strong>. Renove para não perder acesso.
          </p>
          <Link to="/app/subscription">
            <Button size="sm" variant="outline">Ver plano</Button>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
