import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getTmdbFeed } from "@/lib/tmdb.functions";
import { getRadarJobStatus, startRadarSyncJob } from "@/lib/radar-jobs.functions";
import { recalculateRadarAvailability } from "@/lib/radar-admin.functions";
import { Loader2, RefreshCw } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Search, Star, Server, Film, Tv, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/app/inteligencia/")({
  component: ContentIntelligence,
  head: () => ({
    meta: [
      { title: "Inteligência de Conteúdo | Stream Monitor" },
      { name: "description", content: "Lançamentos do TMDB cruzados com o catálogo dos seus servidores IPTV." },
    ],
  }),
});

const FEEDS = [
  { k: "movie_recent", l: "🎬 Filmes recentes" },
  { k: "movie_upcoming", l: "🔜 Próximos lançamentos" },
  { k: "movie_popular", l: "🔥 Filmes populares" },
  { k: "tv_recent", l: "📺 Séries recentes" },
  { k: "tv_popular", l: "⭐ Séries populares" },
] as const;

const IMG = "https://image.tmdb.org/t/p/w342";

function year(d: string | null) {
  return d ? d.slice(0, 4) : "—";
}

function ContentIntelligence() {
  const [feed, setFeed] = useState<(typeof FEEDS)[number]["k"]>("movie_recent");
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const run = useServerFn(getTmdbFeed);

  const qc = useQueryClient();
  const jobStatus = useServerFn(getRadarJobStatus);
  const startJob = useServerFn(startRadarSyncJob);
  const recalcAction = useServerFn(recalculateRadarAvailability);

  const statusQuery = useQuery({
    queryKey: ["radar-job-status"],
    queryFn: () => jobStatus(),
    retry: false,
    refetchInterval: 10_000,
  });

  const isAdmin = !!statusQuery.data || (statusQuery.error as any)?.status === 200; // Heurística se o data for nulo mas o loader passou
  console.log("[Radar UI] Admin check:", { isAdmin, data: statusQuery.data });

  const job = (statusQuery.data as any)?.job as
    | {
        status: string;
        processed: number;
        total_servers: number;
        success_count: number;
        failed_count: number;
        movies_found: number;
        series_found: number;
      }
    | null
    | undefined;
  const running = job && (job.status === "queued" || job.status === "running");

  const startMutation = useMutation({
    mutationFn: () => startJob(),
    onSuccess: () => {
      toast.success("Sincronização iniciada em segundo plano. Pode fechar o navegador.");
      qc.invalidateQueries({ queryKey: ["radar-job-status"] });
    },
    onError: (e: Error) => toast.error("Erro ao iniciar sincronização: " + e.message),
  });

  const recalcMutation = useMutation({
    mutationFn: () => recalcAction(),
    onSuccess: (res: any) => {
      toast.success(`Recálculo concluído! ${res.total} registros atualizados.`);
      qc.invalidateQueries({ queryKey: ["tmdb-feed"] });
    },
    onError: (e: Error) => toast.error("Erro no recálculo: " + e.message),
  });


  const { data, isLoading, error } = useQuery({
    queryKey: ["tmdb-feed", feed, query],
    queryFn: () =>
      run({ data: { feed, query: query === "ranking_mode" ? undefined : query || undefined, ranking: query === "ranking_mode" } }),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6 space-y-4 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
          <Brain className="h-4 w-4" /> Inteligência de Conteúdo
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Radar de Conteúdo</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Lançamentos direto do TMDB cruzados automaticamente com o catálogo dos seus servidores — descubra 
            onde cada filme ou série já está disponível.
          </p>
        </div>
        <form
          className="flex gap-2 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(term.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar filme ou série..." value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <Button type="submit">Buscar</Button>
          {query && (
            <Button type="button" variant="ghost" onClick={() => { setTerm(""); setQuery(""); }}>
              Limpar
            </Button>
          )}
        </form>
        {data && (
          <p className="text-xs text-muted-foreground">
            Cruzando com {data.totalServers} servidor{data.totalServers === 1 ? "" : "es"} cadastrado
            {data.totalServers === 1 ? "" : "s"}.
          </p>
        )}
      </Card>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-3 rounded-lg border border-primary/10">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Radar de Conteúdo (Admin)
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <Button
            size="sm"
            variant="outline"
            className="bg-primary/5 border-primary/20 hover:bg-primary/10"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || !!running}
          >
            {startMutation.isPending || running ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {running ? "Sincronizando em segundo plano..." : "🔄 Sincronizar conteúdos agora"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-primary"
            onClick={() => recalcMutation.mutate()}
            disabled={recalcMutation.isPending}
          >
            {recalcMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalcular disponibilidade
          </Button>

          {job && (
            <div className="text-xs text-muted-foreground">
              Servidores {job.processed ?? 0}/{job.total_servers ?? 0} · 🎬 {(job.movies_found ?? 0).toLocaleString("pt-BR")} ·
              📺 {(job.series_found ?? 0).toLocaleString("pt-BR")} · ✅ {job.success_count ?? 0} · ❌ {job.failed_count ?? 0}
            </div>
          )}
        </div>
      )}



      <div className="flex flex-wrap gap-2">
        {FEEDS.map((f) => (
          <Button
            key={f.k}
            size="sm"
            variant={feed === f.k && !query && !data?.ranking ? "default" : "outline"}
            onClick={() => {
              setFeed(f.k);
              setQuery("");
              setTerm("");
            }}
          >
            {f.l}
          </Button>
        ))}
        {isAdmin && (
          <Button
            size="sm"
            variant={data?.ranking ? "default" : "outline"}
            onClick={() => {
              setQuery("ranking_mode");
            }}
          >
            <TrendingUp className="h-4 w-4 mr-1" /> Ranking Atualização
          </Button>
        )}
      </div>

      {error ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Não foi possível carregar o TMDB. {(error as Error).message}
        </Card>
      ) : isLoading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] w-full rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : data?.ranking ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.ranking.map((s: any, i: number) => (
            <Card key={i} className="p-5 flex items-center justify-between border-primary/20 bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-primary/40 italic">#{i + 1}</div>
                <div>
                  <div className="font-semibold text-lg">{s.name}</div>
                  <div className="text-xs text-muted-foreground">Total: {s.total} conteúdos</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-emerald-500 font-bold text-xl">+{s.updates}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Últimos 7 dias</div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {data?.items?.map((it) => (
            <Link
              key={`${it.media_type}-${it.tmdb_id}`}
              to="/app/inteligencia/$media/$id"
              params={{ media: it.media_type as any, id: String(it.tmdb_id) }}
              className="group"
            >
              <Card className="overflow-hidden h-full flex flex-col hover:border-primary/60 transition-colors">
                <div className="relative aspect-[2/3] bg-muted">
                  {it.poster_path ? (
                    <img
                      src={`${IMG}${it.poster_path}`}
                      alt={`Capa de ${it.title}`}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center text-muted-foreground">
                      {it.media_type === "movie" ? <Film className="h-8 w-8" /> : <Tv className="h-8 w-8" />}
                    </div>
                  )}
                  <Badge className="absolute top-2 left-2 text-[10px]" variant="secondary">
                    {it.media_type === "movie" ? "Filme" : "Série"}
                  </Badge>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[11px] font-medium">
                    <Star className="h-3 w-3 text-yellow-500" /> {(it as any).vote_average?.toFixed(1) || "0.0"}
                  </div>

                </div>
                <div className="p-3 space-y-1.5 flex-1">
                  <div className="text-sm font-medium line-clamp-2">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{year(it.release_date)}</div>
                  <div className="flex flex-col gap-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Server className="h-3 w-3 text-muted-foreground" />
                      <span className={(it.found_count ?? 0) > 0 ? "text-emerald-500 font-bold" : "text-muted-foreground"}>
                        🎬 Disponível em {it.found_count ?? 0} servidor{(it.found_count ?? 0) !== 1 ? "es" : ""}
                      </span>
                    </div>
                    {(it.found_count ?? 0) > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1">
                        <div className="flex items-center gap-1.5 text-primary font-medium">
                          <Sparkles className="h-3 w-3" />
                          Presente no catálogo
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </Card>
            </Link>
          ))}
          {(!data?.items || data.items.length === 0) && !data?.ranking && (
            <Card className="p-8 col-span-full text-center text-sm text-muted-foreground">Nenhum resultado.</Card>
          )}
        </div>
      )}
    </div>
  );
}
