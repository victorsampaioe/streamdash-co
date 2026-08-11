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
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm">
              Sua assinatura expirou. Os recursos premium estão bloqueados até a renovação.
            </p>
          </div>
          <Link to="/app/subscription" className="w-full sm:w-auto">
            <Button size="sm" variant="destructive" className="w-full sm:w-auto">Renovar Assinatura</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (data.isExpiringSoon) {
    return (
      <div className="border-b border-warning/40 bg-warning/10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <Clock className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm">
              Sua assinatura vence em <strong>{data.daysRemaining} dia{data.daysRemaining === 1 ? "" : "s"}</strong>. Renove para não perder acesso.
            </p>
          </div>
          <Link to="/app/subscription" className="w-full sm:w-auto">
            <Button size="sm" variant="outline" className="w-full sm:w-auto">Ver plano</Button>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
