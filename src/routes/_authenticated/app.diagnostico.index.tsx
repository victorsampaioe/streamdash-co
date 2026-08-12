import { createFileRoute, Link } from "@tanstack/react-router";
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
  Brain
} from "lucide-react";
import { getTmdbFeed } from "@/lib/tmdb.functions";
import { getMyDiagnostics } from "@/lib/diagnostics-history.functions";
import { DiagnosticDialog } from "@/components/iptv/diagnostic-dialog";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/diagnostico/")({
  component: ContentDiagnosticPage,
  head: () => ({
    meta: [
      { title: "Diagnóstico de Conteúdo | Stream Monitor" },
      { name: "description", content: "Valide se um conteúdo está funcionando corretamente no servidor ou se é um problema local." },
    ],
  }),
});

const IMG = "https://image.tmdb.org/t/p/w342";

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
  const [selectedServer, setSelectedServer] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getFeed = useServerFn(getTmdbFeed);
  const getHistory = useServerFn(getMyDiagnostics);
  const { data: subData } = useSubscription();

  const searchResults = useQuery({
    queryKey: ["tmdb-search-diagnostic", query],
    queryFn: () => getFeed({ data: { feed: "movie_recent", query } }),
    enabled: !!query,
  });

  const historyQuery = useQuery({
    queryKey: ["my-diagnostics-history"],
    queryFn: () => getHistory(),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (term.trim().length >= 3) {
      setQuery(term.trim());
      setSelectedContent(null);
    }
  };

  const openDiagnostic = (content: any, server: any) => {
    setSelectedContent(content);
    setSelectedServer(server);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
          <Activity className="h-4 w-4" /> Diagnóstico de Conteúdo
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">Validador Inteligente</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Descubra se o problema está no servidor ou na sua conexão. Pesquise um filme ou série abaixo para iniciar o teste de 9 etapas.
        </p>
      </div>

      <Card className="p-6 bg-muted/30 border-primary/10">
        <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              className="pl-9 h-11 bg-background" 
              placeholder="Digite o nome do filme, série ou canal..." 
              value={term} 
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" disabled={term.trim().length < 3}>
            Buscar
          </Button>
        </form>
      </Card>

      {query && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Resultados para "{query}"
            </h2>
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setTerm(""); }}>Limpar busca</Button>
          </div>

          {searchResults.isLoading ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="aspect-[2/3] bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {searchResults.data?.items?.map((it: any) => (
                <Link
                  key={`${it.media_type}-${it.tmdb_id}`}
                  to="/app/inteligencia/$media/$id"
                  params={{ media: it.media_type, id: String(it.tmdb_id) }}
                  className="group relative aspect-[2/3] overflow-hidden rounded-lg border border-border/50 hover:border-primary/50 transition-all"
                >
                  {it.poster_path ? (
                    <img src={`${IMG}${it.poster_path}`} alt={it.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="h-full w-full bg-muted flex items-center justify-center">
                      {it.media_type === "movie" ? <Film className="h-8 w-8 text-muted-foreground" /> : <Tv className="h-8 w-8 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <div className="text-xs font-bold text-white line-clamp-2 mb-1">{it.title}</div>
                    <Badge variant="secondary" className="w-fit text-[9px] py-0 px-1">Ver Servidores</Badge>
                  </div>
                </Link>
              ))}
              {(!searchResults.data?.items || searchResults.data.items.length === 0) && (
                <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                  Nenhum conteúdo encontrado com este nome.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-primary" /> Últimos Diagnósticos
        </h2>
        
        <div className="grid gap-3">
          {historyQuery.isLoading ? (
            [1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)
          ) : historyQuery.data?.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground border-dashed bg-muted/5">
              Você ainda não realizou nenhum diagnóstico. Busque um conteúdo acima para começar.
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
                      <div className="font-semibold text-sm truncate max-w-[200px] sm:max-w-md">{d.content_title || 'Conteúdo desconhecido'}</div>
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
                      onClick={() => openDiagnostic(
                        { tmdb_id: d.content_id, title: d.content_title, media_type: d.content_type },
                        { id: d.server_id, name: d.servers?.name }
                      )}
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

      {selectedContent && selectedServer && (
        <DiagnosticDialog 
          isOpen={isDialogOpen} 
          onClose={() => setIsDialogOpen(false)}
          serverId={selectedServer.id}
          serverName={selectedServer.name}
          contentId={String(selectedContent.tmdb_id)}
          contentTitle={selectedContent.title}
          contentType={selectedContent.media_type as any}
        />
      )}
    </div>
  );
}
