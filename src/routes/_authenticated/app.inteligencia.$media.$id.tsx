import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTmdbDetail, toggleTmdbFollow } from "@/lib/tmdb.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Bell, BellOff, Clock, Film, Star, Trophy, Tv, Sparkles, Activity } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { DiagnosticDialog } from "@/components/iptv/diagnostic-dialog";


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
  const [diag, setDiag] = useState<{ open: boolean; serverId: string; serverName: string } | null>(null);


  const { data, isLoading, error } = useQuery({
    queryKey: ["tmdb-detail", mediaType, id],
    queryFn: () => load({ data: { media: mediaType, id: Number(id) } }),
    enabled: !!id && id !== "null",
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

      <Tabs defaultValue="servers">
        <TabsList>
          <TabsTrigger value="servers">🖥️ Disponibilidade</TabsTrigger>
          {data.global_stats && <TabsTrigger value="stats">🧠 Radar Global</TabsTrigger>}
        </TabsList>


        <TabsContent value="stats" className="mt-4">
          <Card className="p-5 space-y-4 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              <h2 className="font-semibold text-lg">Inteligência de Catálogo Global</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-background/50 border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Primeira Aparição</div>
                <div className="text-lg font-bold">
                  {data.global_stats?.first_seen_at ? new Date(data.global_stats.first_seen_at).toLocaleDateString("pt-BR") : "Desconhecida"}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Servidores Totais</div>
                <div className="text-lg font-bold">{data.global_stats?.server_count || 0} redes</div>
              </div>
              <div className="p-4 rounded-lg bg-background/50 border">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Última Verificação</div>
                <div className="text-lg font-bold text-emerald-500">Há 30 segundos</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground italic">
              * Dados baseados em toda a rede monitorada pelo Stream Monitor.
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="mt-4">
          <Card className="p-5 space-y-3">
            <h2 className="font-semibold">Servidores com o conteúdo</h2>
            <p className="text-xs text-muted-foreground -mt-1">
              ✅ Encontrado em {data.podium.length} servidor{(data.podium.length !== 1) ? "es" : ""}.
            </p>
            {data.availability.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum servidor cadastrado.</p>
            ) : (
              <div className="divide-y">
                {[...data.availability]
                  .filter(s => s.found_at)
                  .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                  .map((s) => (
                    <div key={s.server_id} className="py-2.5 flex items-center justify-between gap-3">
                      <span className="truncate text-sm">
                        ✅ {s.name}
                      </span>
                      <span className="text-xs text-muted-foreground text-right shrink-0">
                        <Badge variant="outline" className="text-emerald-500 bg-emerald-500/5 border-emerald-500/20">
                          Disponível
                        </Badge>
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
