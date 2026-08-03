import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles, Film, Library, Tv, TrendingDown, Trophy, Medal, History, Gauge, Info, Search, CheckCircle2, XCircle,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/app/novidades")({
  component: NovidadesPage,
  head: () => ({
    meta: [
      { title: "Inteligência de Conteúdo IPTV | Stream Monitor" },
      {
        name: "description",
        content:
          "Acompanhe filmes, séries e canais adicionados ou removidos dos seus servidores IPTV, com ranking de atualização e comparativo automático.",
      },
      { property: "og:title", content: "Inteligência de Conteúdo IPTV | Stream Monitor" },
      {
        property: "og:description",
        content: "Novidades do catálogo, ranking de atualização e comparativo entre servidores monitorados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Novelties = {
  added_movies: number;
  added_series: number;
  added_channels: number;
  removed: number;
  items: {
    server_name: string;
    kind: "live" | "vod" | "series";
    action: "added" | "removed";
    name: string;
    category: string | null;
    detected_at: string;
  }[];
};

type UpdateRow = {
  server_id: string;
  name: string;
  added_movies: number;
  added_series: number;
  added_channels: number;
  added_total: number;
  is_mine: boolean;
};

type FirstRow = {
  title_key: string;
  title: string;
  kind: string;
  servers: { server_name: string; seen_at: string }[];
};

type CompareRow = {
  server_id: string;
  name: string;
  channels: number | null;
  movies: number | null;
  series: number | null;
  health_score: number | null;
  latency_ms: number | null;
  synced_at: string | null;
  growth_7d: number;
  removed_7d: number;
  is_mine: boolean;
};

type DailyRow = {
  day: string;
  channels: number;
  movies: number;
  series: number;
  added_movies: number;
  added_series: number;
  added_channels: number;
  removed_count: number;
};

type FindRow = {
  title_key: string;
  title: string;
  kind: string;
  server_count: number;
  first_server: string;
  first_seen_at: string;
  mine_has: boolean;
  servers: { server_name: string; seen_at: string; is_mine: boolean }[];
};

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: unknown }> }).rpc(fn, args);

const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const dt = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const KIND_LABEL: Record<string, string> = { live: "Canal", vod: "Filme", series: "Série" };
const MEDALS = ["🥇", "🥈", "🥉"];

function NovidadesPage() {
  const [hours, setHours] = useState(24);
  const [firstKind, setFirstKind] = useState<"vod" | "series" | "live">("vod");
  const [sort, setSort] = useState<keyof CompareRow>("health_score");
  const [term, setTerm] = useState("");
  const [findKind, setFindKind] = useState<"vod" | "series" | "live">("vod");
  const [query, setQuery] = useState("");

  const { data: found = [], isFetching: finding } = useQuery({
    queryKey: ["iptv-find-title", query, findKind],
    enabled: query.trim().length >= 2,
    queryFn: async () =>
      ((await rpc("iptv_find_title", { _query: query.trim(), _kind: findKind, _limit: 30 })).data ?? []) as FindRow[],
  });



  const { data: nov } = useQuery({
    queryKey: ["iptv-novelties", hours],
    queryFn: async () => ((await rpc("iptv_novelties", { _hours: hours })).data ?? null) as Novelties | null,
    refetchInterval: 120_000,
  });

  const { data: ranking = [] } = useQuery({
    queryKey: ["iptv-update-ranking"],
    queryFn: async () => ((await rpc("iptv_update_ranking", { _days: 7, _limit: 20 })).data ?? []) as UpdateRow[],
    refetchInterval: 120_000,
  });

  const { data: firsts = [] } = useQuery({
    queryKey: ["iptv-first-detected", firstKind],
    queryFn: async () =>
      ((await rpc("iptv_first_detected", { _kind: firstKind, _days: 14, _limit: 20 })).data ?? []) as FirstRow[],
  });

  const { data: compare = [] } = useQuery({
    queryKey: ["iptv-comparison"],
    queryFn: async () => ((await rpc("iptv_server_comparison", { _limit: 100 })).data ?? []) as CompareRow[],
    refetchInterval: 120_000,
  });

  const { data: daily = [] } = useQuery({
    queryKey: ["iptv-catalog-daily"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("iptv_catalog_daily")
        .select("day, channels, movies, series, added_movies, added_series, added_channels, removed_count")
        .gte("day", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
        .order("day", { ascending: true });
      return (data ?? []) as DailyRow[];
    },
  });

  const history = useMemo(() => {
    const map = new Map<string, DailyRow>();
    for (const r of daily) {
      const cur = map.get(r.day);
      map.set(r.day, {
        day: r.day,
        channels: (cur?.channels ?? 0) + r.channels,
        movies: (cur?.movies ?? 0) + r.movies,
        series: (cur?.series ?? 0) + r.series,
        added_movies: (cur?.added_movies ?? 0) + r.added_movies,
        added_series: (cur?.added_series ?? 0) + r.added_series,
        added_channels: (cur?.added_channels ?? 0) + r.added_channels,
        removed_count: (cur?.removed_count ?? 0) + r.removed_count,
      });
    }
    return Array.from(map.values()).map((r) => ({ ...r, label: r.day.slice(8) + "/" + r.day.slice(5, 7) }));
  }, [daily]);

  const delta = useMemo(() => {
    if (history.length < 2) return null;
    const a = history[history.length - 2]!;
    const b = history[history.length - 1]!;
    return { yesterday: a.movies, today: b.movies, diff: b.movies - a.movies };
  }, [history]);

  const compareRows = useMemo(() => {
    const list = [...compare];
    list.sort((a, b) => {
      if (sort === "latency_ms") return (a.latency_ms ?? 9e9) - (b.latency_ms ?? 9e9);
      const va = (a[sort] as number) ?? -1;
      const vb = (b[sort] as number) ?? -1;
      return vb - va;
    });
    return list;
  }, [compare, sort]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Inteligência de Conteúdo IPTV
        </h1>
        <p className="text-sm text-muted-foreground">
          Evolução automática do catálogo dos servidores monitorados: novidades, remoções, ranking de atualização e
          comparativo. Coletamos apenas metadados (nome e categoria) — nunca vídeo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { h: 24, l: "Hoje (24h)" },
          { h: 72, l: "3 dias" },
          { h: 168, l: "7 dias" },
        ].map((o) => (
          <Button key={o.h} size="sm" variant={hours === o.h ? "default" : "outline"} onClick={() => setHours(o.h)}>
            {o.l}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<Film className="h-4 w-4" />} label="Filmes adicionados" value={`+${num(nov?.added_movies ?? 0)}`} tone="success" />
        <Stat icon={<Library className="h-4 w-4" />} label="Séries adicionadas" value={`+${num(nov?.added_series ?? 0)}`} tone="success" />
        <Stat icon={<Tv className="h-4 w-4" />} label="Novos canais" value={`+${num(nov?.added_channels ?? 0)}`} tone="success" />
        <Stat icon={<TrendingDown className="h-4 w-4" />} label="Conteúdos removidos" value={`-${num(nov?.removed ?? 0)}`} tone="destructive" />
      </div>

      <Tabs defaultValue="recentes">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="recentes">Conteúdos recentes</TabsTrigger>
          <TabsTrigger value="novidades">Novidades</TabsTrigger>
          <TabsTrigger value="ranking">Ranking de atualização</TabsTrigger>
          <TabsTrigger value="detector">Detector de filmes</TabsTrigger>
          <TabsTrigger value="first">Quem adicionou primeiro</TabsTrigger>
          <TabsTrigger value="compare">Comparativo</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* -------- Conteúdos recentes por servidor -------- */}
        <TabsContent value="recentes" className="mt-4">
          <RecentContents />
        </TabsContent>


        {/* -------- Novidades -------- */}
        <TabsContent value="novidades" className="mt-4">
          <Card className="divide-y">
            {!nov?.items?.length ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma mudança detectada nesse período. A primeira sincronização apenas mapeia o catálogo — as
                novidades aparecem a partir da próxima coleta.
              </p>
            ) : (
              nov.items.map((it, i) => (
                <div key={i} className="p-3 flex items-center gap-3">
                  <span className="text-lg">{it.action === "removed" ? "📉" : it.kind === "vod" ? "🎬" : it.kind === "series" ? "📚" : "📺"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{it.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {KIND_LABEL[it.kind]} · {it.server_name} · {dt(it.detected_at)}
                    </div>
                  </div>
                  <Badge variant={it.action === "removed" ? "destructive" : "secondary"}>
                    {it.action === "removed" ? "Removido" : "Novo"}
                  </Badge>
                </div>
              ))
            )}
          </Card>
        </TabsContent>

        {/* -------- Ranking de atualização -------- */}
        <TabsContent value="ranking" className="mt-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h2 className="font-semibold">Servidores que mais atualizam (7 dias)</h2>
            </div>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ainda sem dados suficientes.</p>
            ) : (
              <div className="divide-y">
                {ranking.map((r, i) => (
                  <div key={r.server_id} className="py-3 flex items-center gap-3">
                    <div className="w-8 text-center">{MEDALS[i] ?? <span className="font-mono text-muted-foreground text-sm">#{i + 1}</span>}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {r.name}
                        {r.is_mine && <Badge variant="outline" className="ml-2 text-[10px]">Seu servidor</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        🎬 {num(r.added_movies)} filmes · 📚 {num(r.added_series)} séries · 📺 {num(r.added_channels)} canais
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-sm">+{num(r.added_total)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* -------- Detector de filmes -------- */}
        <TabsContent value="detector" className="mt-4 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Detector de filmes e séries</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Digite um título para descobrir quais servidores monitorados já possuem o conteúdo, quem detectou primeiro
              e se o seu servidor está atualizado.
            </p>
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(term);
              }}
            >
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Ex.: Duna, Round 6, Premiere Clubes..."
                className="flex-1"
              />
              <Button type="submit" disabled={term.trim().length < 2}>
                Buscar
              </Button>
            </form>
            <div className="flex gap-2">
              {(["vod", "series", "live"] as const).map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={findKind === k ? "default" : "outline"}
                  onClick={() => setFindKind(k)}
                >
                  {k === "vod" ? "Filmes" : k === "series" ? "Séries" : "Canais"}
                </Button>
              ))}
            </div>
          </Card>

          {query.trim().length < 2 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Faça uma busca para comparar a disponibilidade do título entre os servidores.
            </Card>
          ) : finding ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">Procurando nos catálogos...</Card>
          ) : found.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum servidor monitorado possui “{query}” no catálogo de{" "}
              {findKind === "vod" ? "filmes" : findKind === "series" ? "séries" : "canais"}.
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {found.map((f) => (
                <Card key={f.title_key} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{f.title}</div>
                    {f.mine_has ? (
                      <Badge variant="secondary" className="gap-1 shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Você tem
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1 shrink-0">
                        <XCircle className="h-3 w-3" /> Falta no seu
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Em {f.server_count} servidor{f.server_count > 1 ? "es" : ""} · 🥇 primeiro: {f.first_server} (
                    {dt(f.first_seen_at)})
                  </div>
                  <div className="space-y-1 pt-1 border-t">
                    {(f.servers ?? []).map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="truncate">
                          {MEDALS[i] ?? `#${i + 1}`} {s.server_name}
                          {s.is_mine && <Badge variant="outline" className="ml-2 text-[10px]">Seu</Badge>}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">{dt(s.seen_at)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* -------- Quem adicionou primeiro -------- */}
        <TabsContent value="first" className="mt-4 space-y-3">
          <Card className="p-3 flex items-start gap-2 border-primary/30 bg-primary/5">
            <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              Esta ordem representa a <strong>primeira detecção entre os servidores monitorados pelo Stream Monitor</strong>,
              e não necessariamente o primeiro do mercado.
            </p>
          </Card>
          <div className="flex gap-2">
            {(["vod", "series", "live"] as const).map((k) => (
              <Button key={k} size="sm" variant={firstKind === k ? "default" : "outline"} onClick={() => setFirstKind(k)}>
                {k === "vod" ? "Filmes" : k === "series" ? "Séries" : "Canais"}
              </Button>
            ))}
          </div>
          {firsts.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum conteúdo em comum detectado entre servidores monitorados nos últimos 14 dias.
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {firsts.map((f) => (
                <Card key={f.title_key} className="p-4">
                  <div className="font-medium mb-2 flex items-center gap-2">
                    <Medal className="h-4 w-4 text-yellow-500" /> {f.title}
                  </div>
                  <div className="space-y-1">
                    {(f.servers ?? []).map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="truncate">{MEDALS[i] ?? `#${i + 1}`} {s.server_name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{dt(s.seen_at)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* -------- Comparativo -------- */}
        <TabsContent value="compare" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["movies", "Mais filmes"],
              ["series", "Mais séries"],
              ["channels", "Mais canais"],
              ["health_score", "Melhor Health Score"],
              ["latency_ms", "Menor latência"],
              ["growth_7d", "Catálogo que mais cresce"],
            ] as [keyof CompareRow, string][]).map(([k, l]) => (
              <Button key={k} size="sm" variant={sort === k ? "default" : "outline"} onClick={() => setSort(k)}>
                {l}
              </Button>
            ))}
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3 font-medium w-12">#</th>
                  <th className="text-left p-3 font-medium">Servidor</th>
                  <th className="text-right p-3 font-medium">📺 Canais</th>
                  <th className="text-right p-3 font-medium">🎬 Filmes</th>
                  <th className="text-right p-3 font-medium">📚 Séries</th>
                  <th className="text-right p-3 font-medium">🟢 Health</th>
                  <th className="text-right p-3 font-medium">⚡ Latência</th>
                  <th className="text-right p-3 font-medium">📈 7 dias</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r, i) => (
                  <tr key={r.server_id} className={`border-t border-border/60 hover:bg-muted/30 ${r.is_mine ? "bg-primary/5" : ""}`}>
                    <td className="p-3 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">
                      {r.name}
                      {r.is_mine && <Badge variant="outline" className="ml-2 text-[10px]">Seu</Badge>}
                    </td>
                    <td className="p-3 text-right font-mono">{num(r.channels)}</td>
                    <td className="p-3 text-right font-mono">{num(r.movies)}</td>
                    <td className="p-3 text-right font-mono">{num(r.series)}</td>
                    <td className="p-3 text-right font-mono font-semibold">{r.health_score ?? "—"}%</td>
                    <td className="p-3 text-right font-mono">{r.latency_ms != null ? `${r.latency_ms} ms` : "—"}</td>
                    <td className="p-3 text-right font-mono">
                      <span className="text-success">+{num(r.growth_7d)}</span>
                      {r.removed_7d > 0 && <span className="text-destructive ml-1">-{num(r.removed_7d)}</span>}
                    </td>
                  </tr>
                ))}
                {compareRows.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Sem servidores validados nas últimas 48h.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* -------- Histórico -------- */}
        <TabsContent value="history" className="mt-4 space-y-3">
          {delta && (
            <Card className="p-4 flex flex-wrap items-center gap-4">
              <Gauge className="h-5 w-5 text-primary" />
              <span className="text-sm">
                Ontem: <strong>{num(delta.yesterday)}</strong> filmes · Hoje: <strong>{num(delta.today)}</strong> filmes ·{" "}
                <strong className={delta.diff >= 0 ? "text-success" : "text-destructive"}>
                  {delta.diff >= 0 ? "+" : ""}{num(delta.diff)} filmes
                </strong>
              </span>
            </Card>
          )}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Evolução do catálogo (30 dias)</h2>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Histórico será construído a cada sincronização diária.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="movies" name="Filmes" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                    <Area type="monotone" dataKey="series" name="Séries" stroke="hsl(var(--chart-2, var(--primary)))" fill="transparent" />
                    <Area type="monotone" dataKey="channels" name="Canais" stroke="hsl(var(--muted-foreground))" fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "success" | "destructive" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold font-mono ${tone === "success" ? "text-success" : "text-destructive"}`}>{value}</div>
    </Card>
  );
}
