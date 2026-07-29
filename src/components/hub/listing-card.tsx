import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowUpRight, Tag } from "lucide-react";
import { CATEGORY_LABEL } from "@/components/hub/categories";
import { ReputationBadges, type HubProfileLite } from "@/components/hub/reputation-badges";

export type ListingRow = {
  id: string;
  kind: "offer" | "demand";
  category: string;
  title: string;
  description: string;
  price_cents: number | null;
  location: string | null;
  created_at: string;
  author_id: string;
  hub_profiles?: HubProfileLite | null;
};

export function formatPrice(cents: number | null) {
  if (cents == null) return "A combinar";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function ListingCard({ item }: { item: ListingRow }) {
  const isOffer = item.kind === "offer";
  return (
    <Link
      to="/app/hub/l/$id"
      params={{ id: item.id }}
      className="block group"
    >
      <Card className="p-4 h-full flex flex-col gap-3 transition-all hover:border-primary/50 hover:shadow-lg">
        <div className="flex items-start gap-2">
          <Badge variant={isOffer ? "default" : "outline"} className="shrink-0">
            {isOffer ? "Oferta" : "Demanda"}
          </Badge>
          <Badge variant="secondary" className="shrink-0 text-xs">
            <Tag className="h-3 w-3 mr-1" />
            {CATEGORY_LABEL[item.category] ?? item.category}
          </Badge>
          <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold leading-tight line-clamp-2">{item.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
        </div>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="space-y-1 min-w-0">
            {item.location && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.location}</span>
              </div>
            )}
            {item.hub_profiles && (
              <ReputationBadges p={item.hub_profiles} compact />
            )}
          </div>
          <div className="font-mono text-sm font-semibold text-primary shrink-0">
            {formatPrice(item.price_cents)}
          </div>
        </div>
      </Card>
    </Link>
  );
}
