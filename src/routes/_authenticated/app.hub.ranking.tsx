import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, ShieldCheck, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/hub/ranking")({
  component: RankingPage,
});

type Row = {
  user_id: string;
  handle: string;
  rating_avg: number;
  rating_count: number;
  business_count: number;
  verified: boolean;
  premium: boolean;
  score: number;
};

function RankingPage() {
  const { data = [], isLoading } = useQuery<Row[]>({
    queryKey: ["hub-ranking"],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("hub_get_ranking", { _period_days: 30, _limit: 30 });
      return (data ?? []) as Row[];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <h2 className="font-semibold">Top membros do Hub</h2>
          <span className="text-xs text-muted-foreground">avaliações + negócios + verificado</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem dados suficientes para o ranking.</p>
        ) : (
          <div className="divide-y">
            {data.map((r, i) => (
              <div key={r.user_id} className="py-3 flex items-center gap-3">
                <div className="w-8 text-center font-mono text-sm text-muted-foreground">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">@{r.handle}</span>
                    {r.verified && (
                      <Badge className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="secondary">
                        <ShieldCheck className="h-3 w-3" /> Verificado
                      </Badge>
                    )}
                    {r.premium && (
                      <Badge className="gap-1 border-primary/40 bg-primary/10 text-primary" variant="secondary">
                        <Crown className="h-3 w-3" /> Premium
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {Number(r.rating_avg).toFixed(1)} ({r.rating_count})</span>
                    <span>{r.business_count} negócios</span>
                  </div>
                </div>
                <div className="font-mono text-sm font-semibold">{Number(r.score).toFixed(0)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
