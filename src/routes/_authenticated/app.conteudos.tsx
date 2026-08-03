import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw, DownloadCloud, Star, Activity, ShieldAlert, Search, Radar, Brain, Zap,
} from "lucide-react";
import {
  importContentCatalog, scanServerContents, recheckContent, turboScanServer,
  getBrokenCatalogInsights, toggleContentFavorite, saveContentAlertSettings,
} from "@/lib/content-monitor.functions";


export const Route = createFileRoute("/_authenticated/app/conteudos")({
  component: ContentMonitorPage,
  head: () => ({
    meta: [
      { title: "Monitor de Conteúdos Offline | Stream Monitor" },
      {
        name: "description",
        content:
          "Verifique automaticamente quais filmes, séries, episódios e canais do seu servidor IPTV estão online, lentos, instáveis ou offline.",
      },
      { property: "og:title", content: "Monitor de Conteúdos Offline | Stream Monitor" },
      {
        property: "og:description",
        content: "Saúde do catálogo IPTV em tempo real: online, lento, instável, offline, bloqueado ou removido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS: Record<string, { label: string; cls: string }> = {
  online: { label: "🟢 Online", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  slow: { label: "🟡 Lento", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  unstable: { label: "🟠 Instável", cls: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
  offline: { label: "🔴 Offline", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  blocked: { label: "🔒 Bloqueado", cls: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  removed: { label: "⚫ Removido", cls: "bg-muted text-muted-foreground border-border" },
  unknown: { label: "⚪ Sem análise", cls: "bg-muted text-muted-foreground border-border" },
};

const TYPE_LABEL: Record<string, string> = {
  live: "Canal", movie: "Filme", series: "Série", episode: "Episódio",
};

function scoreLabel(score: number) {
  if (score >= 90) return "Excelente";
  if (score >= 80) return "Bom";
  if (score >= 70) return "Atenção";
  if (score >= 50) return "Ruim";
  return "Crítico";
}

function ContentMonitorPage() {
  const qc = useQueryClient();
  const [serverId, setServerId] = useState<string>("");
  const [status, setStatus] = useState<string>("offline");
  const [type, setType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const doImport = useServerFn(importContentCatalog);
  const doScan = useServerFn(scanServerContents);
  const doRecheck = useServerFn(recheckContent);
  const doFav = useServerFn(toggleContentFavorite);
  const doSaveSettings = useServerFn(saveContentAlertSettings);

  const servers = useQuery({
    queryKey: ["cm-servers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("servers").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const effectiveServer = serverId || servers.data?.[0]?.id || "";

  const summary = useQuery({
    queryKey: ["cm-summary", effectiveServer],
    enabled: !!effectiveServer,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("content_health_overview", { _server_id: effectiveServer });
      if (error) throw error;
      return data as any;
    },
  });

  const contents = useQuery({
    queryKey: ["cm-contents", effectiveServer, status, type, search],
    enabled: !!effectiveServer,
    queryFn: async () => {
      let q = supabase
        .from("monitored_contents")
        .select("id, name, content_type, category_name, cover_url, current_status, http_status, last_error, consecutive_failures, response_time_ms, last_checked_at, last_online_at, is_favorite")
        .eq("server_id", effectiveServer)
        .order("last_checked_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (status !== "all") q = q.eq("current_status", status as any);
      if (type !== "all") q = q.eq("content_type", type as any);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const insights = useQuery({
    queryKey: ["cm-insights"],
    queryFn: () => getBrokenCatalogInsights(),
    staleTime: 120_000,
  });

  const alertSettings = useQuery({
    queryKey: ["cm-alert-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_alert_settings").select("*").is("server_id", null).maybeSingle();
      return data;
    },
  });

  const health = useMemo(() => {
    const s = summary.data ?? {};
    const total = Number(s.total ?? 0);
    if (!total) return 0;
    const ok = Number(s.online ?? 0) + Number(s.slow ?? 0);
    return Math.round((ok / total) * 1000) / 10;
  }, [summary.data]);

  async function run(kind: "import" | "scan") {
    if (!effectiveServer) return;
    setBusy(kind);
    try {
      if (kind === "import") {
        const r: any = await doImport({ data: { serverId: effectiveServer } });
        toast.success(`Catálogo importado: ${r.imported} conteúdos`);
      } else {
        const r: any = await doScan({ data: { serverId: effectiveServer, batch: 24 } });
        toast.success(
          r.generalFailure
            ? "🚨 Possível falha geral do servidor — testes suspensos"
            : `Verificados ${r.tested} · ${r.failed} falhas · ${r.recovered} recuperados`,
        );
      }
      qc.invalidateQueries({ queryKey: ["cm-summary"] });
      qc.invalidateQueries({ queryKey: ["cm-contents"] });
      qc.invalidateQueries({ queryKey: ["cm-insights"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na operação");
    } finally {
      setBusy(null);
    }
  }

  const s = summary.data ?? {};

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" /> Monitor de Conteúdos Offline
          </h1>
          <p className="text-sm text-muted-foreground">
            Testes controlados na Player API: filmes, séries, episódios e canais.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={effectiveServer} onValueChange={setServerId}>
            <SelectTrigger className="w-[210px]"><SelectValue placeholder="Servidor" /></SelectTrigger>
            <SelectContent>
              {(servers.data ?? []).map((sv: any) => (
                <SelectItem key={sv.id} value={sv.id}>{sv.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!!busy || !effectiveServer} onClick={() => run("import")}>
            <DownloadCloud className="mr-2 h-4 w-4" />
            {busy === "import" ? "Importando..." : "Importar catálogo"}
          </Button>
          <Button disabled={!!busy || !effectiveServer} onClick={() => run("scan")}>
            <Activity className="mr-2 h-4 w-4" />
            {busy === "scan" ? "Verificando..." : "Verificar agora"}
          </Button>
        </div>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Saúde do catálogo</TabsTrigger>
          <TabsTrigger value="offline">Conteúdos</TabsTrigger>
          <TabsTrigger value="insights">Catálogo quebrado</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 pt-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Content Health Score</p>
                <p className="text-3xl font-bold">{health}% <span className="text-base font-medium text-muted-foreground">{scoreLabel(health)}</span></p>
              </div>
              <Badge variant="outline">{Number(s.total ?? 0).toLocaleString("pt-BR")} conteúdos</Badge>
            </div>
            <Progress value={health} className="mt-4" />
            <p className="mt-2 text-xs text-muted-foreground">
              Última verificação: {s.last_checked_at ? new Date(s.last_checked_at).toLocaleString("pt-BR") : "—"}
              {s.avg_ms ? ` · Tempo médio de abertura: ${s.avg_ms} ms` : ""}
            </p>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Online", s.online, "text-emerald-400"],
              ["Lentos", s.slow, "text-amber-400"],
              ["Instáveis", s.unstable, "text-orange-400"],
              ["Offline", s.offline, "text-red-400"],
              ["Bloqueados", s.blocked, "text-purple-300"],
              ["Removidos", s.removed, "text-muted-foreground"],
              ["Sem análise", s.unknown, "text-muted-foreground"],
              ["Total", s.total, "text-foreground"],
            ].map(([label, value, cls]) => (
              <Card key={label as string} className="p-4">
                <p className="text-xs text-muted-foreground">{label as string}</p>
                <p className={`text-2xl font-bold ${cls as string}`}>{Number(value ?? 0).toLocaleString("pt-BR")}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="offline" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar conteúdo..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.keys(STATUS).map((k) => (
                  <SelectItem key={k} value={k}>{STATUS[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="movie">Filmes</SelectItem>
                <SelectItem value="series">Séries</SelectItem>
                <SelectItem value="episode">Episódios</SelectItem>
                <SelectItem value="live">Canais</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {(contents.data ?? []).map((c: any) => {
              const st = STATUS[c.current_status] ?? STATUS.unknown;
              return (
                <Card key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  {c.cover_url ? (
                    <img src={c.cover_url} alt={`Capa de ${c.name}`} loading="lazy"
                      className="h-16 w-12 rounded object-cover" />
                  ) : (
                    <div className="flex h-16 w-12 items-center justify-center rounded bg-muted text-xs text-muted-foreground">—</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[c.content_type]} · {c.category_name ?? "sem categoria"}
                      {c.http_status ? ` · HTTP ${c.http_status}` : ""}
                      {c.response_time_ms ? ` · ${c.response_time_ms} ms` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.last_error ? `Motivo: ${c.last_error}` : "Sem erros recentes"} ·
                      {" "}Falhas: {c.consecutive_failures} ·
                      {" "}Última análise: {c.last_checked_at ? new Date(c.last_checked_at).toLocaleString("pt-BR") : "—"}
                      {c.last_online_at ? ` · Última vez online: ${new Date(c.last_online_at).toLocaleString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    <Button size="icon" variant="ghost" title="Favoritar"
                      onClick={async () => {
                        await doFav({ data: { contentId: c.id, favorite: !c.is_favorite } });
                        qc.invalidateQueries({ queryKey: ["cm-contents"] });
                      }}>
                      <Star className={`h-4 w-4 ${c.is_favorite ? "fill-amber-400 text-amber-400" : ""}`} />
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={async () => {
                        try {
                          await doRecheck({ data: { contentId: c.id } });
                          toast.success("Conteúdo verificado novamente");
                          qc.invalidateQueries({ queryKey: ["cm-contents"] });
                          qc.invalidateQueries({ queryKey: ["cm-summary"] });
                        } catch (e: any) { toast.error(e?.message ?? "Falha ao verificar"); }
                      }}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Verificar
                    </Button>
                  </div>
                </Card>
              );
            })}
            {contents.data && contents.data.length === 0 && (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Nenhum conteúdo encontrado com esses filtros. Importe o catálogo e rode uma verificação.
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-3 pt-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Brain className="h-4 w-4 text-primary" /> Catálogo Quebrado Inteligente</h2>
            <div className="mt-3 space-y-2 text-sm">
              {insights.data?.bestServer && (
                <p>✅ Catálogo mais saudável: <b>{insights.data.bestServer.name}</b> ({insights.data.bestServer.healthPct}% funcionando)</p>
              )}
              {insights.data?.worstServer && (
                <p>⚠️ Mais conteúdos offline: <b>{insights.data.worstServer.name}</b> ({insights.data.worstServer.offline} offline)</p>
              )}
              {(insights.data?.crossBroken ?? []).slice(0, 8).map((c: any) => (
                <p key={c.name}>🔁 <b>{c.name}</b> está offline em {c.servers} servidores monitorados.</p>
              ))}
              {(insights.data?.newBroken ?? []).length > 0 && (
                <p>🆕 {(insights.data?.newBroken ?? []).length} novidades adicionadas já com link quebrado.</p>
              )}
              {(insights.data?.slowest ?? []).slice(0, 5).map((c: any) => (
                <p key={c.name}>🐌 <b>{c.name}</b> abre em {c.ms} ms.</p>
              ))}
              {!insights.data?.servers?.length && (
                <p className="text-muted-foreground">Sem dados suficientes ainda — importe o catálogo e rode verificações.</p>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="pt-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-primary" /> Alertas de conteúdo no Telegram</h2>
            <AlertSettingsForm
              initial={alertSettings.data}
              onSave={async (values) => {
                try {
                  await doSaveSettings({ data: values });
                  toast.success("Preferências salvas");
                  qc.invalidateQueries({ queryKey: ["cm-alert-settings"] });
                } catch (e: any) { toast.error(e?.message ?? "Falha ao salvar"); }
              }}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AlertSettingsForm({ initial, onSave }: { initial: any; onSave: (v: any) => Promise<void> }) {
  const [v, setV] = useState({
    notify_movies: initial?.notify_movies ?? true,
    notify_series: initial?.notify_series ?? true,
    notify_channels: initial?.notify_channels ?? true,
    notify_recovery: initial?.notify_recovery ?? true,
    notify_only_favorites: initial?.notify_only_favorites ?? false,
    minimum_failures: initial?.minimum_failures ?? 3,
    telegram_enabled: initial?.telegram_enabled ?? true,
  });
  const rows: [keyof typeof v, string][] = [
    ["telegram_enabled", "Receber alertas no Telegram"],
    ["notify_movies", "Filmes"],
    ["notify_series", "Séries e episódios"],
    ["notify_channels", "Canais ao vivo"],
    ["notify_recovery", "Avisar quando normalizar"],
    ["notify_only_favorites", "Somente favoritos"],
  ];
  return (
    <div className="mt-4 space-y-3">
      {rows.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between">
          <Label htmlFor={key}>{label}</Label>
          <Switch id={key} checked={!!v[key]} onCheckedChange={(c) => setV({ ...v, [key]: c })} />
        </div>
      ))}
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="minf">Falhas consecutivas mínimas</Label>
        <Input id="minf" type="number" min={1} max={10} className="w-24"
          value={v.minimum_failures}
          onChange={(e) => setV({ ...v, minimum_failures: Number(e.target.value) || 3 })} />
      </div>
      <Button onClick={() => onSave(v)}>Salvar preferências</Button>
    </div>
  );
}
