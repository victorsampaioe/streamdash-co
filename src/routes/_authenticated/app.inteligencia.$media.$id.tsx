import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTmdbDetail, toggleTmdbFollow } from "@/lib/tmdb.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Bell, BellOff, Clock, Film, Star, Trophy, Tv, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/inteligencia/$media/$id")({
  component: TitleDetail,
  head: () => ({
    meta: [
      { title: "Detalhes do título | Stream Monitor" },
      { name: "description", content: "Ficha completa do TMDB e disponibilidade do conteúdo nos seus servidores." },
    ],
  }),
});

const IMG = "https://image.tmdb.org/t/p/w500";
const MEDALS = ["🥇", "🥈", "🥉"];

const full = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function TitleDetail() {
  const { media, id } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getTmdbDetail);
  const follow = useServerFn(toggleTmdbFollow);
  const mediaType = media === "tv" ? "tv" : "movie";

  const { data, isLoading, error } = useQuery({
    queryKey: ["tmdb-detail", mediaType, id],
    queryFn: () => load({ data: { media: mediaType, id: Number(id) } }),
  });

  if (isLoading) return <Card className="p-10 text-center text-sm text-muted-foreground">Carregando ficha...</Card>;
  if (error || !data)
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Não foi possível carregar o título. {(error as Error)?.message}
      </Card>
    );

  const d = data.detail;
  const missing = data.availability.filter((a) => !a.found_at);

  const onFollow = async () => {
    try {
      const res = await follow({
        data: {
          media: mediaType,
          id: Number(id),
          title: d.title,
          poster_path: d.poster_path,
          release_date: d.release_date,
          follow: !data.following,
        },
      });
      toast.success(res.following ? "Você está seguindo este título." : "Deixou de seguir.");
      qc.invalidateQueries({ queryKey: ["tmdb-detail", mediaType, id] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/inteligencia">
          <ArrowLeft className="h-4 w-4 mr-1" /> Lançamentos
        </Link>
      </Button>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="w-40 sm:w-52 shrink-0 mx-auto sm:mx-0">
            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted">
              {d.poster_path ? (
                <img src={`${IMG}${d.poster_path}`} alt={`Capa de ${d.title}`} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-muted-foreground">
                  {mediaType === "movie" ? <Film className="h-8 w-8" /> : <Tv className="h-8 w-8" />}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{mediaType === "movie" ? "Filme" : "Série"}</Badge>
              {d.release_date && <Badge variant="outline">{d.release_date.slice(0, 4)}</Badge>}
              {d.genres.map((g) => (
                <Badge key={g} variant="secondary">
                  {g}
                </Badge>
              ))}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">{d.title}</h1>
            <div className="flex items-center gap-1.5 text-sm">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="font-semibold">{d.vote_average.toFixed(1)}</span>
              <span className="text-muted-foreground">nota TMDB</span>
            </div>

            <dl className="grid sm:grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-sm">
              {d.director && (
                <>
                  <dt className="text-muted-foreground">Direção</dt>
                  <dd>{d.director}</dd>
                </>
              )}
              {d.cast.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Elenco</dt>
                  <dd>{d.cast.join(", ")}</dd>
                </>
              )}
              {d.runtime_minutes && (
                <>
                  <dt className="text-muted-foreground">Duração</dt>
                  <dd>{d.runtime_minutes} min</dd>
                </>
              )}
              {d.seasons && (
                <>
                  <dt className="text-muted-foreground">Temporadas</dt>
                  <dd>{d.seasons}</dd>
                </>
              )}
              {d.countries.length > 0 && (
                <>
                  <dt className="text-muted-foreground">País</dt>
                  <dd>{d.countries.join(", ")}</dd>
                </>
              )}
            </dl>

            {d.overview && <p className="text-sm text-muted-foreground leading-relaxed">{d.overview}</p>}

            <Button onClick={onFollow} variant={data.following ? "outline" : "default"}>
              {data.following ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
              {data.following ? "Seguindo" : "Seguir título"}
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="podium">
        <TabsList>
          <TabsTrigger value="podium">🏆 Quem adicionou primeiro</TabsTrigger>
          <TabsTrigger value="servers">🖥️ Disponibilidade</TabsTrigger>
          {data.global_stats && <TabsTrigger value="stats">🧠 Radar Global</TabsTrigger>}
        </TabsList>

        <TabsContent value="podium" className="mt-4">
          <Card className="p-5 space-y-3 border-yellow-500/20 bg-yellow-500/5">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h2 className="font-semibold text-lg">Reconhecimento Real por Servidor</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Descubra quem foi o primeiro a disponibilizar este conteúdo no catálogo.
            </p>
            {data.podium.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum servidor monitorado possui este conteúdo ainda.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-yellow-500/40 bg-yellow-500/20 px-4 py-3 text-sm flex items-center justify-between">
                  <div>
                    <span className="text-xl mr-2">🥇</span>
                    <b>{data.podium[0].name}</b>
                    <span className="text-xs text-muted-foreground ml-2">adicionou primeiro</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-emerald-500">
                    Hoje {new Date(data.podium[0].found_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </Badge>
                </div>
                <div className="divide-y border-t mt-4">
                  {data.podium.map((p, i) => (
                    <div key={p.server_id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-6 text-center">{MEDALS[i] ?? `${i + 1}º`}</span>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Detectado {new Date(p.found_at!).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="text-[10px]">
                          {p.quality || "HD"}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          ⚡ {p.latency_ms}ms
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <Card className="p-5 space-y-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <h2 className="font-semibold text-lg">Inteligência de Catálogo Global</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-background/50 border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Primeira Aparição</div>
                <div className="text-lg font-bold">{new Date(data.global_stats?.first_seen_at!).toLocaleDateString("pt-BR")}</div>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Servidores Totais</div>
                <div className="text-lg font-bold">{data.global_stats?.server_count} redes</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground italic">
              * Dados baseados em toda a rede monitorada pelo Stream Monitor.
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="mt-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Servidores cadastrados</h2>
            <p className="text-xs text-muted-foreground -mt-1">
              ✅ {data.podium.length} com o conteúdo · ❌ {missing.length} ainda sem.
            </p>
            {data.availability.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum servidor cadastrado.</p>
            ) : (
              <div className="divide-y">
                {[...data.availability]
                  .sort((a, b) => Number(!!b.found_at) - Number(!!a.found_at))
                  .map((s) => (
                    <div key={s.server_id} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="truncate text-sm">
                        {s.found_at ? "🟢" : "🔴"} {s.name}
                      </span>
                      <span className="text-xs text-muted-foreground text-right shrink-0">
                        {s.found_at ? "✅ Encontrado" : "❌ Não encontrado"}
                        {s.last_sync_at && (
                          <span className="block font-mono">Última sync: {full(s.last_sync_at)}</span>
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
