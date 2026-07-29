import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReputationBadges } from "@/components/hub/reputation-badges";
import { ListingCard, type ListingRow } from "@/components/hub/listing-card";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hub/u/$handle")({
  component: UserProfile,
});

function UserProfile() {
  const { handle } = Route.useParams();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["hub-user", handle],
    queryFn: async () => {
      const { data: hp } = await (supabase as any).from("hub_profiles").select("*").eq("handle", handle).maybeSingle();
      if (!hp) return null;
      const { data: sub } = await (supabase as any).rpc("subscription_is_active", { _user_id: hp.id });
      const { data: listings } = await (supabase as any).from("listings")
        .select("id,kind,category,title,description,price_cents,location,created_at,author_id")
        .eq("author_id", hp.id).eq("status","active").order("created_at",{ascending:false}).limit(20);
      const { data: ratings } = await (supabase as any).from("ratings")
        .select("stars,comment,created_at").eq("ratee_id", hp.id).order("created_at",{ascending:false}).limit(10);
      return { ...hp, premium: !!sub, listings: (listings ?? []) as ListingRow[], ratings: ratings ?? [] };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!data) return <Card className="p-8 text-center text-muted-foreground">Usuário não encontrado.</Card>;

  return (
    <div className="space-y-4 max-w-4xl">
      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">@{data.handle}</h1>
            {data.location && <p className="text-sm text-muted-foreground">{data.location}</p>}
            {data.bio && <p className="mt-2 text-sm whitespace-pre-wrap">{data.bio}</p>}
          </div>
          <ReputationBadges p={data} />
        </div>
        <p className="text-xs text-muted-foreground">
          No Stream Monitor desde {formatDistanceToNow(new Date(data.created_at), { addSuffix: true, locale: ptBR })}
        </p>
      </Card>

      <div>
        <h2 className="font-semibold mb-2">Anúncios ativos</h2>
        {data.listings.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Sem anúncios ativos.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.listings.map((l: ListingRow) => <ListingCard key={l.id} item={l} />)}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-2">Últimas avaliações</h2>
        {data.ratings.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Sem avaliações ainda.</Card>
        ) : (
          <div className="space-y-2">
            {data.ratings.map((r: any, i: number) => (
              <Card key={i} className="p-3 flex gap-3 items-start">
                <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{r.stars}</Badge>
                <div className="flex-1 min-w-0">
                  {r.comment && <p className="text-sm">{r.comment}</p>}
                  <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
