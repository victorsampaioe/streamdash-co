import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Star, Crown, Handshake } from "lucide-react";

export type HubProfileLite = {
  handle?: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  business_count?: number | null;
  verification_status?: string | null;
  premium?: boolean;
};

export function ReputationBadges({ p, compact = false }: { p: HubProfileLite; compact?: boolean }) {
  const rating = Number(p.rating_avg ?? 0);
  const count = Number(p.rating_count ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs">
        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
        <span className="font-medium">{rating.toFixed(1)}</span>
        <span className="text-muted-foreground">({count})</span>
      </span>
      {p.verification_status === "approved" && (
        <Badge variant="secondary" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="h-3 w-3" /> Verificado
        </Badge>
      )}
      {p.premium && (
        <Badge variant="secondary" className="gap-1 border-primary/40 bg-primary/10 text-primary">
          <Crown className="h-3 w-3" /> Premium
        </Badge>
      )}
      {!compact && (p.business_count ?? 0) > 0 && (
        <Badge variant="outline" className="gap-1 text-xs">
          <Handshake className="h-3 w-3" /> {p.business_count} negócios
        </Badge>
      )}
    </div>
  );
}
