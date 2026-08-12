import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Activity, 
  Search, 
  History, 
  Server, 
  Film, 
  Tv, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Globe, 
  User,
  ArrowLeft,
  ChevronRight,
  Play
} from "lucide-react";
import { searchDiagnosticContent, getSeriesSeasons } from "@/lib/diagnostics-search.functions";
import { getMyDiagnostics } from "@/lib/diagnostics-history.functions";
import { DiagnosticDialog } from "@/components/iptv/diagnostic-dialog";
import { useSubscription } from "@/hooks/use-subscription";

export const Route = createFileRoute("/_authenticated/app/diagnostico/")({
  component: ContentDiagnosticPage,
  head: () => ({
    meta: [
      { title: "Diagnóstico de Conteúdo | Stream Monitor" },
      { name: "description", content: "Valide se um conteúdo está funcionando corretamente no servidor ou se é um problema local." },
    ],
  }),
});

const STATUS_MAP = {
  working: { label: 'Funcionando', color: 'text-emerald-500', icon: CheckCircle2 },
  slow: { label: 'Lento', color: 'text-yellow-500', icon: Activity },
  unstable: { label: 'Instável', color: 'text-orange-500', icon: AlertCircle },
  unavailable: { label: 'Indisponível', color: 'text-red-500', icon: XCircle },
  server_unavailable: { label: 'Servidor OFF', color: 'text-red-600', icon: Server },
  regional_issue: { label: 'Rota/Região', color: 'text-blue-500', icon: Globe },
  client_issue: { label: 'Problema Local', color: 'text-purple-500', icon: User },
};

function ContentDiagnosticPage() {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [selectedSeason, setSelectedSeason] = useState<any>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<any>(null);
  const [selectedServer, setSelectedServer] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const searchFn = useServerFn(searchDiagnosticContent);
  const getSeasonsFn = useServerFn(getSeriesSeasons);
  const getHistory = useServerFn(getMyDiagnostics);
  const { data: subData } = useSubscription();

  // 1. Busca Unificada
  const searchResults = useQuery({
    queryKey: ["diagnostic-search", query],
    queryFn: () => searchFn({ data: { term: query } }),
    enabled: !!query,
  });

  // 2. Temporadas/Episódios (se for série)
  // Precisamos carregar as temporadas do PRIMEIRO servidor disponível para mostrar a estrutura
  const seasonsQuery = useQuery({
    queryKey: ["series-seasons", selectedContent?.title_key],
    queryFn: () => getSeasonsFn({ 
      data: { 
        serverId: selectedContent.servers[0].id, 
        seriesId: selectedContent.servers[0].external_id 
      } 
    }),
    enabled: !!selectedContent && selectedContent.kind === 'series' && !selectedEpisode,
  });

  const historyQuery = useQuery({
    queryKey: ["my-diagnostics-history"],
    queryFn: () => getHistory(),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (term.trim().length >= 2) {
      setQuery(term.trim());
      setSelectedContent(null);
      setSelectedSeason(null);
      setSelectedEpisode(null);
      setSelectedServer(null);
    }
  };

  const startDiagnostic = (server: any) => {
    setSelectedServer(server);
    setIsDialogOpen(true);
  };

  const resetSelection = () => {
    setSelectedContent(null);
    setSelectedSeason(null);
    setSelectedEpisode(null);
    setSelectedServer(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
          <Activity className="h-4 w-4" /> Diagnóstico de Conteúdo
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">Validador Inteligente</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Busca unificada por canais, filmes ou séries. Descubra se o problema está no servidor ou na sua conexão.
        </p>
      </div>

      {!selectedContent ? (
        <>
          <Card className="p-6 bg-muted/30 border-primary/10">
            <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  className="pl-9 h-11 bg-background" 
                  placeholder="Nome do canal, filme ou série..." 
                  value={term} 
                  onChange={(e) => setTerm(e.target.value)}
                />
              </div>
              <Button type="submit" size="lg" disabled={term.trim().length < 2 || searchResults.isFetching}>
                {searchResults.isFetching ? "Buscando..." : "Buscar"}
              </Button>
            </form>
          </Card>

          {query && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Resultados para "{query}"
                </h2>
                <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setTerm(""); }}>Limpar</Button>
              </div>

              <div className="grid gap-3">
                {searchResults.isLoading ? (
                  [1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)
                ) : searchResults.data?.items?.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                    Nenhum conteúdo encontrado no seu catálogo.
                  </div>
                ) : (
                  searchResults.data?.items?.map((it: any) => (
                    <Card 
                      key={`${it.kind}-${it.title_key}`}
                      className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors border-primary/5"
                      onClick={() => setSelectedContent(it)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          {it.kind === 'live' ? <Tv className="h-5 w-5 text-primary" /> : (it.kind === 'series' ? <Activity className="h-5 w-5 text-primary" /> : <Film className="h-5 w-5 text-primary" />)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{it.title}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            {it.kind === 'live' ? 'Canal de TV' : (it.kind === 'series' ? 'Série' : 'Filme')} • {it.category}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" className="gap-2" onClick={resetSelection}>
            <ArrowLeft className="h-4 w-4" /> Voltar para busca
          </Button>

          <Card className="p-6 bg-muted/20 border-primary/10">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {selectedContent.kind === 'live' ? <Tv className="h-12 w-12 text-primary" /> : (selectedContent.kind === 'series' ? <Activity className="h-12 w-12 text-primary" /> : <Film className="h-12 w-12 text-primary" />)}
              </div>
              <div className="space-y-2">
                <Badge variant="outline" className="text-[10px] uppercase">{selectedContent.kind === 'live' ? 'Canal de TV' : (selectedContent.kind === 'series' ? 'Série' : 'Filme')}</Badge>
                <h2 className="text-2xl font-bold">{selectedContent.title}</h2>
                <p className="text-sm text-muted-foreground">{selectedContent.category}</p>
              </div>
            </div>
          </Card>

          {/* Seleção de Temporada/Episódio (Séries) */}
          {selectedContent.kind === 'series' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Escolha o Episódio</h3>
              {seasonsQuery.isLoading ? (
                <div className="h-32 bg-muted animate-pulse rounded-lg flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  Carregando temporadas e episódios...
                </div>
              ) : seasonsQuery.isError ? (
                <div className="h-32 bg-red-500/5 border border-red-500/20 rounded-lg flex flex-col items-center justify-center text-sm text-red-500 gap-2 p-4 text-center">
                  <AlertCircle className="h-6 w-6" />
                  <div>
                    <div className="font-bold">Não foi possível carregar as temporadas</div>
                    <div className="text-xs opacity-80">{(seasonsQuery.error as any)?.message || "Ocorreu um erro na comunicação com o servidor."}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => seasonsQuery.refetch()} className="mt-2">Tentar novamente</Button>
                </div>
              ) : !seasonsQuery.data?.episodes || Object.keys(seasonsQuery.data.episodes).length === 0 ? (
                <div className="h-32 bg-muted/20 border border-dashed rounded-lg flex flex-col items-center justify-center text-sm text-muted-foreground p-4 text-center">
                  <Tv className="h-6 w-6 opacity-20 mb-2" />
                  Nenhuma temporada ou episódio encontrado para esta série neste servidor.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase">Temporada</label>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.keys(seasonsQuery.data.episodes).sort((a, b) => Number(a) - Number(b)).map(s => (
                        <Button 
                          key={s} 
                          variant={selectedSeason === s ? "default" : "outline"} 
                          size="sm"
                          onClick={() => { setSelectedSeason(s); setSelectedEpisode(null); }}
                        >
                          T{s}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {selectedSeason && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted-foreground uppercase">Episódio</label>
                      <div className="max-h-40 overflow-y-auto space-y-1 pr-2 thin-scrollbar">
                        {seasonsQuery.data.episodes[selectedSeason]?.map((ep: any) => (
                          <Button 
                            key={ep.id} 
                            variant={selectedEpisode?.id === ep.id ? "secondary" : "ghost"} 
                            className="w-full justify-start text-xs h-8"
                            onClick={() => setSelectedEpisode(ep)}
                          >
                            E{ep.episode_num} - {ep.title}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lista de Servidores Disponíveis */}
          {(selectedContent.kind !== 'series' || selectedEpisode) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" /> Servidores com este conteúdo
              </h3>
              <div className="grid gap-3">
                {selectedContent.servers.map((srv: any) => (
                  <Card key={srv.id} className="p-4 flex items-center justify-between bg-background border-primary/5 hover:border-primary/20 transition-all">
                    <div>
                      <div className="font-semibold text-sm">{srv.name}</div>
                      <div className="text-[10px] text-muted-foreground">ID: {selectedContent.kind === 'series' ? selectedEpisode.id : srv.external_id}</div>
                    </div>
                    <Button size="sm" onClick={() => startDiagnostic(srv)} className="gap-2">
                      <Play className="h-3 w-3 fill-current" /> Testar agora
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Histórico Recente (apenas se não houver conteúdo selecionado) */}
      {!selectedContent && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Últimos Diagnósticos
          </h2>
          
          <div className="grid gap-3">
            {historyQuery.isLoading ? (
              [1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)
            ) : historyQuery.data?.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground border-dashed bg-muted/5">
                Você ainda não realizou nenhum diagnóstico.
              </Card>
            ) : (
              historyQuery.data?.map((d: any) => {
                const status = STATUS_MAP[d.status as keyof typeof STATUS_MAP];
                return (
                  <Card key={d.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${status?.color.replace('text-', 'bg-').replace('-500', '-500/10')}`}>
                        {status && <status.icon className={`h-5 w-5 ${status.color}`} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate max-w-[200px] sm:max-w-md">{d.content_title || 'Conteúdo'}</div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Server className="h-3 w-3" /> {d.servers?.name || 'Servidor'}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(d.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-right">
                        <div className={`text-sm font-bold ${status?.color}`}>{status?.label}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{d.duration_ms}ms · {Math.round((d.bytes_read || 0) / 1024)}KB</div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => startDiagnostic({ id: d.server_id, name: d.servers?.name })}
                      >
                        Ver Detalhes
                      </Button>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {selectedServer && (
        <DiagnosticDialog 
          isOpen={isDialogOpen} 
          onClose={() => setIsDialogOpen(false)}
          serverId={selectedServer.id}
          serverName={selectedServer.name}
          contentId={String(
            selectedContent?.kind === 'series' 
              ? selectedEpisode?.id 
              : (selectedContent?.servers?.find((s: any) => s.id === selectedServer.id)?.external_id || selectedContent?.title_key)
          )}
          contentTitle={
            selectedContent?.kind === 'series'
              ? `${selectedContent.title} - S${selectedSeason}E${selectedEpisode?.episode_num}: ${selectedEpisode?.title}`
              : (selectedContent?.title || 'Diagnóstico')
          }
          contentType={(selectedContent?.kind === 'series' ? 'episode' : selectedContent?.kind) || 'movie'}
        />
      )}
    </div>
  );
}
