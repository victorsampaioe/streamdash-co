import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getTmdbFeed } from "@/lib/tmdb.functions";
import { prepareRadarBatchSync, runRadarBatchSyncNow } from "@/lib/radar-stats.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, AlertTriangle } from "lucide-react";
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
  const prepareSync = useServerFn(prepareRadarBatchSync);
  const runSync = useServerFn(runRadarBatchSyncNow);
  const [showConfirm, setShowConfirm] = useState(false);
  const [prepData, setPrepData] = useState<{ 
    servers_found: number; 
    server_ids: string[];
    total_db_servers: number;
    with_host: number;
    with_username: number;
    with_password: number;
    login_approved: number;
    total_monitored: number;
    configured_iptv: number;
    waiting_credentials: number;
    excluded_reasons: {
      no_username: number;
      no_password: number;
      invalid_login: number;
      paused: number;
      inactive_account: number;
    };
  } | null>(null);

  const prepareMutation = useMutation({
    mutationFn: () => prepareSync(),
    onSuccess: (data: any) => {
      console.group("[Radar Tech Log] Preparação Concluída");
      console.log("Total servidores no banco:", data.total_db_servers);
      console.log("Servidores com URL Xtream:", data.with_host);
      console.log("Servidores com Credenciais (User/Pass):", data.with_username, "/", data.with_password);
      console.log("Servidores com Login Aprovado:", data.login_approved);
      console.log("Servidores Aptos (Filtro Final):", data.servers_found);
      console.groupEnd();

      setPrepData(data);
      setShowConfirm(true);
    },

    onError: (e: Error) => {
      console.error("[Radar Tech Log] Erro na preparação do Radar:", e);
      console.error("[Radar Tech Log] Etapa: Chamada RPC prepareRadarBatchSync");
      console.error("[Radar Tech Log] Erro Real:", e.message);
      toast.error("Erro ao preparar sincronização: " + e.message);

    },
  });

  const [syncProgress, setSyncProgress] = useState<{
    processed: number;
    total: number;
    success: number;
    errors: number;
    contents: number;
    results: any[];
  } | null>(null);

  const syncMutation = useMutation({
    mutationFn: async ({ ids, testOne }: { ids: string[]; testOne?: boolean }) => {
      const targetIds = testOne ? ids.slice(0, 1) : ids;
      setSyncProgress({
        processed: 0,
        total: targetIds.length,
        success: 0,
        errors: 0,
        contents: 0,
        results: [],
      });

      console.log(`[Radar Tech Log] Iniciando sincronização. Alvo: ${testOne ? "Teste Individual" : "Lote Completo"}. Qtd: ${targetIds.length}`);
      const res = await runSync({ data: { serverIds: ids, testOne } });
      return res;
    },
    onSuccess: (res: any) => {
      const ok = res.results.filter((r: any) => r.ok).length;
      const fails = res.results.filter((r: any) => !r.ok);
      const contents = res.results.reduce((acc: number, r: any) => acc + (r.contents_found || 0), 0);
      
      setSyncProgress(prev => prev ? {
        ...prev,
        processed: prev.total,
        success: ok,
        errors: fails.length,
        contents: contents,
        results: res.results
      } : null);

      console.group("Relatório Técnico de Sincronização Radar");
      res.results.forEach((r: any) => {
        const icon = r.ok ? "✅" : (r.error?.toLowerCase().includes("login") ? "⚠️" : "❌");
        const msg = r.ok ? `Sincronizado (${r.contents_found || 0} itens)` : (r.error?.toLowerCase().includes("login") ? "Falha de login" : `Erro API: ${r.error}`);
        console.log(`${icon} Servidor ${r.id}: ${msg}`);
      });
      console.groupEnd();

      if (fails.length > 0) {
        toast.warning(`Sincronização concluída: ${ok} sucesso, ${fails.length} falhas. Novos conteúdos: ${contents}`);
      } else {
        toast.success(`Sincronização concluída! ${ok} servidores processados, ${contents} novos conteúdos.`);
      }
      
      qc.invalidateQueries({ queryKey: ["tmdb-feed"] });
    },
    onError: (e: Error) => {
      console.error("[Radar Tech Log] Erro crítico na sincronização do Radar");
      toast.error("Erro na sincronização: " + e.message);
    },
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

      <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-3 rounded-lg border border-primary/10">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Radar de Conteúdo
        </div>
        <div className="h-4 w-px bg-border hidden sm:block" />
        <Button 
          size="sm" 
          variant="outline"
          className="bg-primary/5 border-primary/20 hover:bg-primary/10"
          onClick={() => prepareMutation.mutate()}
          disabled={prepareMutation.isPending || syncMutation.isPending}
        >
          {prepareMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          🔄 Sincronizar conteúdos agora
        </Button>
      </div>

      <Dialog open={showConfirm} onOpenChange={(open) => {
        if (!syncMutation.isPending) {
          setShowConfirm(open);
          if (!open) setSyncProgress(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {syncProgress ? (syncProgress.processed === syncProgress.total ? "Relatório após sincronização" : "Sincronização em Progresso") : "Corrigir filtro da aba Filmes Recentes do Radar IPTV"}
            </DialogTitle>
            <DialogDescription className="text-xs mt-2 whitespace-pre-wrap">
              {syncProgress ? (
                syncProgress.processed === syncProgress.total ? (
                  "Validar desativação real do módulo Conteúdos Offline\n\nA atualização dos textos não é suficiente. Confirmar que o módulo foi realmente desativado.\n\nVerificar:\n\nremover rota /app/conteudos;\nremover jobs/cron/background relacionados;\nparar verificações automáticas;\nremover chamadas de API desse módulo;\nimpedir consumo de recursos do Core AWS;\nremover acesso direto pela URL.\n\nO Radar Inteligente de Conteúdo deve ser o único sistema responsável pelo catálogo.\n\nConfirmar no log que nenhum processo de Conteúdos Offline continua executando."
                ) : (
                  "Validar desativação real do módulo Conteúdos Offline\n\nA atualização dos textos não é suficiente. Confirmar que o módulo foi realmente desativado.\n\nVerificar:\n\nremover rota /app/conteudos;\nremover jobs/cron/background relacionados;\nparar verificações automáticas;\nremover chamadas de API desse módulo;\nimpedir consumo de recursos do Core AWS;\nremover acesso direto pela URL.\n\nO Radar Inteligente de Conteúdo deve ser o único sistema responsável pelo catálogo.\n\nConfirmar no log que nenhum processo de Conteúdos Offline continua executando."
                )
              ) : (
                "Corrigir filtro da aba Filmes Recentes do Radar IPTV\n\nO problema está somente na aba Filmes recentes.\n\nEla ainda está exibindo conteúdos que não são filmes:\n\nrádios;\nlive TV;\nstreams sem TMDB;\nconteúdos sem capa.\n\nCorrigir somente essa consulta:\n\nA aba Filmes recentes deve aceitar apenas:\n\n✅ tipo = movie\n✅ VOD\n✅ tmdb_id válido\n✅ poster/capa disponível\n\nExcluir da listagem:\n\n❌ rádio\n❌ live\n❌ séries\n❌ conteúdos sem TMDB\n\nNão remover o Radar inteiro nem alterar outras abas.\n\nAplicar o mesmo filtro nas abas:\n\nFilmes populares\nPróximos lançamentos\n\nManter séries somente na aba Séries."
              )}
            </DialogDescription>

            <div className="pt-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {syncProgress ? (
                <div className="space-y-4">
                  {syncProgress.processed < syncProgress.total ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Servidores processados:</span>
                        <span className="font-bold">{syncProgress.processed}/{syncProgress.total}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500" 
                          style={{ width: `${(syncProgress.processed / syncProgress.total) * 100}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="bg-emerald-500/10 p-2 rounded text-center">
                          <div className="text-xs text-emerald-500 uppercase">Sucesso</div>
                          <div className="text-xl font-bold">{syncProgress.success}</div>
                        </div>
                        <div className="bg-destructive/10 p-2 rounded text-center">
                          <div className="text-xs text-destructive uppercase">Erro</div>
                          <div className="text-xl font-bold">{syncProgress.errors}</div>
                        </div>
                      </div>
                      <div className="text-center text-xs text-muted-foreground mt-2">
                        Tempo estimado: ~{Math.max(1, (syncProgress.total - syncProgress.processed) * 2)}s
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm py-1 border-b border-border/50">
                        <span>✅ Sincronizados:</span>
                        <span className="font-bold text-emerald-500">{syncProgress.success}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-border/50">
                        <span>⚠️ Falharam:</span>
                        <span className="font-bold text-destructive">{syncProgress.errors}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-border/50">
                        <span>⏳ Sem alterações:</span>
                        <span className="font-bold">{syncProgress.results.filter(r => r.ok && r.no_changes).length}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-border/50">
                        <span>🎬 Novos conteúdos encontrados:</span>
                        <span className="font-bold text-primary">{syncProgress.contents}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 text-left">
                  <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Status da Infraestrutura</div>
                  
                  <div className="flex justify-between text-sm py-1 border-b border-border/50">
                    <span>Total servidores cadastrados:</span>
                    <span className="font-mono">{prepData?.total_db_servers || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1 border-b border-border/50">
                    <span>Servidores com IPTV configurado:</span>
                    <span className="font-mono">{prepData?.configured_iptv || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm py-1 border-b border-border/50 text-primary font-bold">
                    <span>Servidores prontos para sincronização:</span>
                    <span className="font-mono">{prepData?.servers_found || 0}</span>
                  </div>

                  <div className="text-xs font-bold text-muted-foreground uppercase mt-4 mb-1">Regras de Filtro Atuais:</div>
                  <div className="text-[10px] space-y-1 text-muted-foreground bg-muted/30 p-2 rounded border border-border/40">
                    <p>A sincronização usa somente servidores com:</p>
                    <ul className="list-disc list-inside ml-1">
                      <li>URL Xtream válida;</li>
                      <li>usuário IPTV;</li>
                      <li>senha IPTV;</li>
                      <li>login aprovado.</li>
                    </ul>
                    <p className="mt-2 text-destructive/80 font-medium italic">
                      Nunca enviados: sem credencial, contas expiradas ou pausadas.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
            {!syncProgress ? (
              <>
                <Button 
                  variant="outline" 
                  className="sm:mr-auto"
                  onClick={() => prepData && syncMutation.mutate({ ids: prepData.server_ids, testOne: true })}
                  disabled={syncMutation.isPending || !prepData?.servers_found}
                >
                  Fazer um teste forçado (1 servidor)
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancelar</Button>
                  <Button 
                    onClick={() => prepData && syncMutation.mutate({ ids: prepData.server_ids })}
                    disabled={syncMutation.isPending || !prepData?.servers_found}
                    className="gap-2"
                  >
                    {syncMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Iniciar Sincronização
                  </Button>
                </div>
              </>
            ) : (
              syncProgress.processed === syncProgress.total && (
                <Button className="w-full" onClick={() => { setShowConfirm(false); setSyncProgress(null); }}>
                  Fechar Relatório
                </Button>
              )
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>


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
        <Button
          size="sm"
          variant={data?.ranking ? "default" : "outline"}
          onClick={() => {
            setQuery("ranking_mode");
          }}
        >
          <TrendingUp className="h-4 w-4 mr-1" /> Ranking Atualização
        </Button>
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
                          Novidade no catálogo
                        </div>
                        {it.first_server_name && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                             🏆 Primeiro: {it.first_server_name}
                          </div>
                        )}
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
