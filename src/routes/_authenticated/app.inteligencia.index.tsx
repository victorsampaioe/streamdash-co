import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getTmdbFeed } from "@/lib/tmdb.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Search, Star, Server, Film, Tv } from "lucide-react";

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["tmdb-feed", feed, query],
    queryFn: () => run({ data: { feed, query: query || undefined } }),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6 space-y-4 bg-gradient-to-br from-primary/10 to-transparent">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
          <Brain className="h-4 w-4" /> Quem sobe conteúdo mais rápido
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inteligência de Conteúdo</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Lançamentos direto do TMDB cruzados automaticamente com o catálogo dos seus servidores — descubra quem
            adiciona primeiro e onde cada filme ou série já está disponível.
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

      <div className="flex flex-wrap gap-2">
        {FEEDS.map((f) => (
          <Button key={f.k} size="sm" variant={feed === f.k && !query ? "default" : "outline"} onClick={() => { setFeed(f.k); setQuery(""); setTerm(""); }}>
            {f.l}
          </Button>
        ))}
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
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {data?.items.map((it) => (
            <Link
              key={`${it.media_type}-${it.tmdb_id}`}
              to="/app/inteligencia/$media/$id"
              params={{ media: it.media_type, id: String(it.tmdb_id) }}
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
                    <Star className="h-3 w-3 text-yellow-500" /> {it.vote_average.toFixed(1)}
                  </div>
                </div>
                <div className="p-3 space-y-1.5 flex-1">
                  <div className="text-sm font-medium line-clamp-2">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{year(it.release_date)}</div>
                  <div className="flex items-center gap-1 text-xs">
                    <Server className="h-3 w-3 text-muted-foreground" />
                    <span className="text-emerald-500 font-medium">✅ {it.found_count}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-destructive">❌ {it.missing_count}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          {data?.items.length === 0 && (
            <Card className="p-8 col-span-full text-center text-sm text-muted-foreground">Nenhum resultado.</Card>
          )}
        </div>
      )}
    </div>
  );
}
