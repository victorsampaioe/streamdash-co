import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  getPlayerSettings, 
  loginXtreamClient, 
  getPlayerCatalog, 
  validatePlayerSession,
  getPlayerStreamUrl,
  getPlayerServers,
  logoutPlayer,
  getFavorites,
  toggleFavorite,
  getTMDBMetadata,
  diagnosePlayerCatalog

} from "@/lib/player.functions";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Loader2, 
  Play, 
  Tv, 
  Film, 
  Info, 
  User, 
  LogOut, 
  ChevronRight, 
  Search, 
  LayoutGrid, 
  Calendar,
  Star,
  Clock,
  ChevronLeft,
  X,
  PlayCircle,
  Settings as SettingsIcon,
  Plus,
  ArrowRight,
  TrendingUp,
  History,
  CheckCircle2,
  ShieldCheck
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import Hls from "hls.js";

// New Components
import { Sidebar } from "@/components/player/Sidebar";
import { HeroBanner } from "@/components/player/HeroBanner";
import { ContentRow } from "@/components/player/ContentRow";
import { ContentCard } from "@/components/player/ContentCard";
import { SearchOverlay } from "@/components/player/SearchOverlay";
import { SeriesDetails } from "@/components/player/SeriesDetails";
import { cn } from "@/lib/utils";
import { ContentDetailsOverlay } from "@/components/player/ContentDetailsOverlay";



export const Route = createFileRoute("/player/$resellerId")({
  component: PlayerPage,
});

function PlayerPage() {
  const navigate = useNavigate();
  const { resellerId } = Route.useParams();
  const [token, setToken] = useState<string | null>(localStorage.getItem(`stream_player_token_${resellerId}`));
  const [session, setSession] = useState<any>(null);
  const [activeView, setActiveView] = useState<"home" | "live" | "movie" | "series" | "mylist" | "search" | "settings" | "categories">("home");

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [content, setContent] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [selectedSeriesInfo, setSelectedSeriesInfo] = useState<any>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);


  // Home Page Data
  const [homeData, setHomeData] = useState<{
    featured: any;
    continueWatching: any[];
    newReleases: any[];
    liveHighlights: any[];
  }>({
    featured: null,
    continueWatching: [],
    newReleases: [],
    liveHighlights: []
  });

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);


  // Carregar favoritos
  useEffect(() => {
    if (token) {
      getFavorites({ data: { token } })
        .then(setFavorites)
        .catch(console.error);
    }
  }, [token]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: (_, variables) => {
      if (!variables) return;
      const data = variables.data as any;
      const { contentId, contentType, isFavorite } = data;
      if (isFavorite) {
        setFavorites(prev => [...prev, { content_id: contentId, content_type: contentType, name: selectedItem?.name || selectedItem?.title }]);
        toast.success("Adicionado à Minha Lista");
      } else {
        setFavorites(prev => prev.filter(f => f.content_id !== contentId));
        toast.success("Removido da Minha Lista");
      }
    }
  });

  const handleToggleFavorite = (item: any) => {
    if (!token) return;
    const contentId = (item.stream_id || item.series_id || item.id).toString();
    const contentType = item.stream_type === "live" ? "live" : (item.series_id ? "series" : "movie");
    const isFavorite = favorites.some(f => f.content_id === contentId);
    
    toggleFavoriteMutation.mutate({
      data: {
        token,
        contentId,
        contentType,
        isFavorite: !isFavorite
      }
    });
  };


  // Identidade Visual
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["public-player-settings", resellerId],
    queryFn: () => getPlayerSettings({ data: { profileId: resellerId } }),
  });

  // Validar sessão ao carregar
  useEffect(() => {
    if (token) {
      validatePlayerSession({ data: { token } })
        .then((s) => {
          if (s) setSession(s);
          else setToken(null);
        })
        .catch(() => setToken(null));
    }
  }, [token]);

  // Salvar token
  useEffect(() => {
    if (token) localStorage.setItem(`stream_player_token_${resellerId}`, token);
    else localStorage.removeItem(`stream_player_token_${resellerId}`);
  }, [token, resellerId]);

  // Carregar dados da Home
  useEffect(() => {
    if (session && token && activeView === "home") {
      setLoadingContent(true);
      const controller = new AbortController();
      const fetchHome = async () => {
        try {
          const fetchItems = async (action: string, catId?: string) => {
            if (controller.signal.aborted) return [];
            return await getPlayerCatalog({ 
              data: { 
                token, 
                action: action as any, 
                categoryId: catId,
                offset: 0,
                limit: 15
              } 
            });
          };

          // Buscar Novos Lançamentos (VOD)
          const vodCats = await getPlayerCatalog({ data: { token, action: "get_vod_categories" } });
          if (Array.isArray(vodCats) && vodCats.length > 0) {
            const firstCat = vodCats[0];
            const list = await fetchItems("get_vod_streams", firstCat.category_id);
            setHomeData(prev => ({ 
              ...prev, 
              featured: Array.isArray(list) ? list[0] || null : null,
              newReleases: Array.isArray(list) ? list.slice(1, 15) : []
            }));
          }

          // Buscar Canais Ao Vivo
          const liveCats = await getPlayerCatalog({ data: { token, action: "get_live_categories" } });
          if (Array.isArray(liveCats) && liveCats.length > 0) {
            const firstCat = liveCats[0];
            const list = await fetchItems("get_live_streams", firstCat.category_id);
            setHomeData(prev => ({ 
              ...prev, 
              liveHighlights: Array.isArray(list) ? list.slice(0, 10) : []
            }));
          }

          // Buscar Favoritos com metadados (amostra)
          const favs = await getFavorites({ data: { token } });
          if (favs && favs.length > 0) {
            // Em um sistema real, buscaríamos detalhes dos primeiros 10 itens
            // Por enquanto, apenas atualizamos a UI se houver favoritos
            setFavorites(favs);
          }
        } catch (err) {
          console.error("Error loading home data", err);
        } finally {
          setLoadingContent(false);
        }
      };
      fetchHome();
      return () => controller.abort();
    }
  }, [session, token, activeView]);

  // Carregar categorias conforme a aba ativa
  useEffect(() => {
    if (session && token && ["live", "movie", "series"].includes(activeView)) {
      const actionMap = {
        live: "get_live_categories",
        movie: "get_vod_categories",
        series: "get_series_categories"
      } as const;
      
      const action = actionMap[activeView as keyof typeof actionMap];

      if (!action) return;

      getPlayerCatalog({ data: { token, action } })
        .then((data: any) => {
          const list = Array.isArray(data) ? data : [];
          setCategories(list);
          setSelectedCategory(list.length > 0 ? list[0].category_id : null);
        })
        .catch((err: any) => {
          setCategories([]);
          toast.error(err?.message || "Não foi possível carregar o catálogo");
        });
    }
  }, [session, token, activeView]);

  useEffect(() => {
    if (session && token) {
      if (activeView === "search" || activeView === "settings" || activeView === "categories") return;
      
      setLoadingContent(true);
      const controller = new AbortController();
      
      const fetchData = async () => {
        try {
          if (activeView === ("mylist" as any)) {
            const favs = await getFavorites({ data: { token } });
            // Buscar metadados básicos para os favoritos se necessário
            setContent(Array.isArray(favs) ? favs.map((f: any) => ({ 
              ...f, 
              name: f.name || `Item ${f.content_id}`, 
              stream_id: f.content_id,
              series_id: f.content_type === "series" ? f.content_id : undefined
            })) : []); 
            setLoadingContent(false);
            return;
          }

          if (["live", "movie", "series"].includes(activeView)) {
            const actionMap = {
              live: "get_live_streams",
              movie: "get_vod_streams",
              series: "get_series"
            } as const;
            
            const action = actionMap[activeView as keyof typeof actionMap];
            const data = await getPlayerCatalog({ 
              data: { 
                token, 
                action, 
                categoryId: selectedCategory || undefined,
                limit: 40 // Paginação inicial
              } 
            });
            
            if (!controller.signal.aborted) {
              setContent(Array.isArray(data) ? data : []);
            }
          }
        } catch (err: any) {
          if (!controller.signal.aborted) {
            setContent([]);
            toast.error(err?.message || "Não foi possível carregar os conteúdos");
          }
        } finally {
          if (!controller.signal.aborted) {
            setLoadingContent(false);
          }
        }
      };

      fetchData();
      return () => controller.abort();
    }
  }, [session, token, activeView, selectedCategory]);

  const primaryColor = settings?.primary_color || "#3B82F6";
  const secondaryColor = settings?.secondary_color || "#0A0A0A";

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-white/40 animate-pulse font-medium">Carregando sua experiência premium...</p>
        </div>
      </div>
    );
  }


  if (!settings) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <X className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Revendedor não encontrado</h1>
        <p className="text-white/60 max-w-md mb-8">
          O link que você acessou parece estar incorreto ou o revendedor não possui o módulo de Web Player ativo.
        </p>
        <Button onClick={() => navigate({ to: "/" })} variant="outline" className="border-white/10 text-white">
          Voltar para o Início
        </Button>
      </div>
    );
  }

  if (!session) {
    return <LoginForm 
      resellerId={resellerId} 
      settings={settings} 
      onLogin={(data: any) => {
        setToken(data.token);
        setSession(data);
      }}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
    />;
  }

  const handleLogout = async () => {
    if (token) {
      try {
        const { logoutPlayer } = await import("@/lib/player.functions");
        await logoutPlayer({ data: { token } });
      } catch (err) {
        console.error("Erro ao encerrar sessão no servidor:", err);
      }
    }
    setToken(null);
    setSession(null);
    localStorage.removeItem(`stream_player_token_${resellerId}`);
    // Limpar outros dados locais se houver
    toast.success("Sessão encerrada");
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex font-sans">
      <Sidebar 
        activeView={activeView} 
        onChangeView={(v) => {
          if (v === "search") setIsSearchOpen(true);
          else {
            setActiveView(v);
            setSelectedCategory(null); // Resetar categoria ao trocar aba
            setContent([]); // Limpar conteúdo para mostrar skeleton
          }
        }}
        brandName={settings?.brand_name ?? undefined}
        logoUrl={settings?.logo_url ?? undefined}
        onLogout={handleLogout}
        token={token!}
      />


      <main className="flex-1 overflow-y-auto">
        {activeView === "home" && (
          <div className="p-6 md:p-12 space-y-12">
            <HeroBanner 
              item={homeData.featured} 
              items={[homeData.featured, ...homeData.newReleases.slice(0, 4)].filter(Boolean)}
              primaryColor={primaryColor}
              onPlay={(item: any) => {
                const type = item.stream_type === "series" ? "series" : (item.stream_type === "live" ? "live" : "movie");
                if (type === "live") {
                  handlePlay(item.stream_id || item.series_id, "live");
                } else {
                  setSelectedItem(item);
                  setIsDetailsOpen(true);
                }
              }}
              onMyList={(item: any) => handleToggleFavorite(item)}
              isFavorite={(item: any) => favorites.some(f => f.content_id === (item?.stream_id || item?.series_id || item?.id)?.toString())}
            />

            {/* Continuar Assistindo Section */}
            {history.length > 0 && (
              <ContentRow 
                title="Continuar Assistindo" 
                items={history} 
                type="movie" 
                primaryColor={primaryColor}
                onPlay={(item: any) => {
                  setSelectedItem(item);
                  setIsDetailsOpen(true);
                }}
              />
            )}

            {/* Minha Lista Section */}
            {favorites.length > 0 && (
               <ContentRow 
                title="Minha Lista" 
                items={favorites.map(f => ({ ...f, name: f.name || `Item ${f.content_id}` }))} 
                type="movie" 
                primaryColor={primaryColor}
                onPlay={(item: any) => {
                  setSelectedItem(item);
                  setIsDetailsOpen(true);
                }}
              />
            )}

            <ContentRow 
              title="Novidades" 
              items={homeData.newReleases} 
              type="movie" 
              primaryColor={primaryColor}
              onPlay={(item: any) => {
                setSelectedItem(item);
                setIsDetailsOpen(true);
              }}
            />

            <ContentRow 
              title="Recomendados para Você" 
              items={homeData.newReleases.slice().reverse().slice(0, 10)} 
              type="movie" 
              primaryColor={primaryColor}
              onPlay={(item: any) => {
                setSelectedItem(item);
                setIsDetailsOpen(true);
              }}
            />

            <ContentRow 
              title="Destaques Ao Vivo" 
              items={homeData.liveHighlights} 
              type="live" 
              primaryColor={primaryColor}
              onPlay={(item: any) => handlePlay(item.stream_id, "live")}
            />

          </div>
        )}

        {activeView === "categories" && (
          <div className="p-6 md:p-12 space-y-8 animate-in fade-in duration-500">
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <LayoutGrid className="h-8 w-8 text-primary" style={{ color: primaryColor }} />
              Plataformas e Categorias
            </h1>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {[
                { name: "Netflix", logo: "https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg", color: "#E50914" },
                { name: "Prime Video", logo: "https://upload.wikimedia.org/wikipedia/commons/f/f1/Prime_Video.png", color: "#00A8E1" },
                { name: "HBO Max", logo: "https://upload.wikimedia.org/wikipedia/commons/1/17/HBO_Max_Logo.svg", color: "#5822b4" },
                { name: "Disney+", logo: "https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg", color: "#0063e5" },
                { name: "Apple TV+", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a2/Apple_TV%2B_logo.svg", color: "#ffffff" },
              ].map((brand) => (
                <Card 
                  key={brand.name} 
                  className="bg-neutral-900/50 border-white/5 hover:border-white/20 transition-all cursor-pointer group overflow-hidden"
                  onClick={() => {
                    setActiveView("movie");
                    setSelectedCategory(null);
                    toast.info(`Explorando catálogo ${brand.name}`);
                  }}
                >
                  <div className="aspect-video p-6 flex items-center justify-center relative">
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity" 
                      style={{ backgroundColor: brand.color }}
                    />
                    <img src={brand.logo} alt={brand.name} className="h-8 md:h-12 w-auto object-contain brightness-0 invert group-hover:brightness-100 group-hover:invert-0 transition-all" />
                  </div>
                  <div className="p-4 text-center border-t border-white/5 font-bold text-sm text-white/40 group-hover:text-white transition-colors">
                    {brand.name}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeView === ("mylist" as any) && (
          <div className="p-6 md:p-12 space-y-8">
            <h1 className="text-3xl font-bold">Minha Lista</h1>
            {content.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {content.map((item) => (
                  <ContentCard 
                    key={item.content_id || item.id} 
                    item={item} 
                    type={item.content_type || "movie"} 
                    primaryColor={primaryColor} 
                    onClick={(i) => {
                      setSelectedItem(i);
                      setIsDetailsOpen(true);
                    }} 
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center">
                  <Star className="h-10 w-10 text-white/20" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Sua lista está vazia</h2>
                  <p className="text-white/40">Adicione filmes e séries para assistir mais tarde.</p>
                </div>
              </div>
            )}
          </div>
        )}



        {activeView === "settings" && (
          <div className="p-6 md:p-12 max-w-2xl mx-auto space-y-8">
            <h1 className="text-3xl font-bold">Configurações</h1>
            <Card className="p-6 bg-white/5 border-white/10 space-y-6">
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Sua Conta</h2>
                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-primary" style={{ color: primaryColor }} />
                      <div>
                        <p className="text-sm font-medium text-white/90">{session?.xtream_user}</p>
                        <p className="text-xs text-white/40">Usuário do Servidor</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-primary" style={{ color: primaryColor }} />
                      <div>
                        <p className="text-sm font-medium text-white/90">
                          {session?.expires_at ? new Date(session.expires_at).toLocaleDateString() : '--'}
                        </p>
                        <p className="text-xs text-white/40">Sessão expira em</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-3">
                <h2 className="text-lg font-semibold"># Investigação: falhas persistentes na Auditoria Core AWS (apesar do Core estar saudável)</h2>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <h4 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Diagnóstico do Core AWS
                  </h4>
                  <p className="text-xs text-yellow-200/80 leading-relaxed whitespace-pre-wrap">
                    {"## Contexto\nA infraestrutura do Core AWS já foi corrigida e está respondendo corretamente em testes manuais. Porém, o painel de **Auditoria Core AWS** continua mostrando falhas (taxa de sucesso 0%, timeouts, execuções falhando). Preciso descobrir a causa real — o Core está saudável, então o problema deve estar em como o painel está se comunicando com ele (ou em como está exibindo dados antigos).\n\n**Não alterar a arquitetura do Core novamente.** A arquitetura atual está correta e não deve mudar:\n- Painel = dono do banco\n- Core AWS = worker stateless\n- Comunicação via `CRON_SECRET`\n\nO objetivo desta tarefa é **só investigar e corrigir a causa da falha no fluxo automático**, sem redesenhar nada.\n\n---\n\n## Evidências já confirmadas (não precisa re-testar isso)\n\n**1. Core está online e saudável:**\n```\nGET https://core.streammonitor.site/api/public/health?deep=1\n```\nRetorno:\n```json\n{\n  \"status\": \"ok\",\n  \"service\": \"stream-monitor-core-worker\",\n  \"role\": \"worker\",\n  \"env\": {\n    \"IS_CORE\": true,\n    \"WORKER\": true,\n    \"DATABASE\": false,\n    \"CRON_SECRET\": true\n  },\n  \"missing\": []\n}\n```\n\n**2. Teste manual do Core funciona perfeitamente:**\n```bash\ncurl -X POST https://core.streammonitor.site/api/public/core/task \\\n  -H \"x-cron-secret: seu_secret\" \\\n  -H \"content-type: application/json\" \\\n  -d '{\"task\":\"probe-http\",\"host\":\"google.com\"}'\n```\nRetorno:\n```json\n{\n  \"success\": true,\n  \"result\": {\n    \"status\": \"up\",\n    \"httpStatus\": 301,\n    \"latency\": 80,\n    \"dnsIp\": \"172.217.162.238\",\n    \"error\": null,\n    \"sslDays\": 58\n  }\n}\n```\n\nOu seja: Core recebe requisição ✅, `CRON_SECRET` funciona ✅, probe HTTP funciona ✅. **O problema não está no Core em si — está em algum lugar entre o painel e o Core, ou na exibição dos dados.**\n\n---\n\n## O que preciso que seja investigado, passo a passo\n\n### 1. Confirmar a variável de ambiente do painel\nVerificar se o painel (frontend/backend, não o Core) está configurado com:\n```\nCORE_API_URL=https://core.streammonitor.site\n```\nConfirmar que essa variável está definida corretamente no ambiente de produção do painel (não só no Core) — se estiver ausente, vazia, apontando para `localhost` ou para uma URL antiga, o painel pode estar tentando processar o monitoramento **localmente** em vez de delegar pro Core AWS, o que explicaria falhas que não aparecem nos testes manuais direto no Core.\n\n### 2. Identificar a última execução com falha REAL (não histórico antigo)\nBuscar apenas execuções criadas **depois** do ajuste do `CRON_SECRET` — ignorar qualquer registro anterior a essa correção. Para a execução com falha mais recente, informar:\n- Horário exato\n- Endpoint chamado\n- Payload enviado\n- Status HTTP recebido\n- Resposta completa retornada pelo Core (ou ausência de resposta)\n- Mensagem de erro completa (stack trace se houver)\n\n### 3. Mapear o fluxo automático (scheduler → Core)\nAnalisar os arquivos:\n- `src/lib/core-api.server.ts`\n- `src/lib/monitoring.server.ts`\n- `src/routes/api/public/core/task.ts`\n\nConfirmar:\n- Qual função chama o Core automaticamente (o scheduler/cron do painel).\n- Qual payload exatamente está sendo montado e enviado nessa chamada automática.\n- Se o header está sendo enviado corretamente como `x-cron-secret: process.env.CRON_SECRET` (checar se a variável não está `undefined` nesse contexto específico — não só no `.env`, mas no runtime real do processo que dispara o cron).\n- Se o `host` (ou outro campo obrigatório do payload) está chegando preenchido corretamente até a chamada final, ou se está sendo perdido/formatado errado em algum passo intermediário.\n\n### 4. Comparar o payload manual (que funciona) com o payload automático (que falha)\nO teste manual usa:\n```json\n{ \"task\": \"probe-http\", \"host\": \"google.com\" }\n```\nComparar isso com o que o scheduler automático de fato envia. Erros comuns a procurar:\n- Campo errado, ex. `\"url\"` em vez de `\"host\"`:\n  ```json\n  { \"task\": \"probe-http\", \"url\": \"https://dominio.com\" }\n  ```\n- Campo presente mas vazio/nulo:\n  ```json\n  { \"task\": \"probe-http\", \"host\": null }\n  ```\n- Formato esperado (correto):\n  ```json\n  { \"task\": \"probe-http\", \"host\": \"dominio.com\" }\n  ```\n\nSe o payload automático estiver diferente do formato que o teste manual usa com sucesso, essa é provavelmente a causa raiz.\n\n### 5. Verificar se a tela de Auditoria está mostrando dado desatualizado\nConfirmar se os \"0% de sucesso\" exibidos são:\n- Registros antigos, de antes da correção do `CRON_SECRET` (cache/histórico não atualizado); ou\n- Execuções novas, realmente falhando agora.\n\nSe for histórico antigo sendo exibido, adicionar um filtro por data/hora na tela de Auditoria para deixar claro o que é execução recente vs. antiga, e evitar essa confusão se acontecer de novo no futuro.\n\n### 6. Adicionar logs temporários para rastrear exatamente onde a falha ocorre\nNo envio da requisição do painel para o Core:\n```\n[CORE REQUEST] task: probe-http | host: xxx | secret: presente/ausente | timestamp: xxx\n```\nNa resposta recebida:\n```\n[CORE RESPONSE] status: 200 | result: up/down | error: xxx\n```\nEsses logs devem deixar claro se a requisição automática:\n- Nunca chega a sair do painel (erro antes de enviar).\n- Sai mas com payload/header errado.\n- Chega no Core mas o Core responde erro (nesse caso o log do lado do Core também precisa ser checado).\n- Chega e retorna sucesso, mas o painel interpreta/grava errado o resultado.\n\n---\n\n## Entregável esperado\n1. Identificação clara da causa raiz (não \"parece que é X\" — mostrar o log/print da execução real com falha).\n2. Correção aplicada no ponto exato da causa (payload, variável de ambiente, ou leitura/gravação do resultado no painel — o que for).\n3. Print ou log confirmando que uma execução automática (do scheduler real, não teste manual) rodou com sucesso depois da correção.\n4. Confirmação de que a taxa de sucesso na tela de Auditoria voltou a refletir a realidade (não precisa ser 100%, mas precisa bater com o que de fato está acontecendo)."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10"
                  disabled={diagLoading}
                  onClick={async () => {
                    if (!token) return;
                    setDiagLoading(true);
                    setDiag(null);
                    try {
                      const r = await diagnosePlayerCatalog({ data: { token } });
                      console.log("[CATALOG_DEBUG] relatório completo:", r);
                      setDiag(r);
                    } catch (e: any) {
                      console.error("[CATALOG_DEBUG] falha no diagnóstico", e);
                      setDiag({ erro: e?.message, stack: e?.stack });
                    } finally {
                      setDiagLoading(false);
                    }
                  }}
                >
                  {diagLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Rodar diagnóstico de catálogo
                </Button>
                {diag && (
                  <pre
                    data-testid="player-diagnostic"
                    className="max-h-96 overflow-auto rounded-xl bg-black/60 p-4 text-[11px] leading-relaxed text-emerald-300"
                  >
{JSON.stringify(diag, null, 2)}
                  </pre>
                )}
              </div>

              <div className="pt-6 border-t border-white/5">

                <Button 
                  variant="destructive" 
                  className="w-full h-12 rounded-xl font-bold"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 h-5 w-5" /> Sair da Conta
                </Button>
              </div>
            </Card>
          </div>
        )}

        {(activeView === "live" || activeView === "movie" || activeView === "series") && (
          <div className="p-6 md:p-12 space-y-8">

            <h1 className="text-3xl font-bold capitalize">{activeView === "live" ? "TV Ao Vivo" : activeView === "movie" ? "Filmes" : "Séries"}</h1>
            
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat.category_id}
                  onClick={() => setSelectedCategory(cat.category_id)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all",
                    selectedCategory === cat.category_id 
                      ? "bg-white text-black" 
                      : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  {cat.category_name}
                </button>
              ))}
            </div>

            {loadingContent ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="aspect-[2/3] bg-white/5 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {content.map((item) => (
                  <ContentCard 
                    key={item.stream_id || item.series_id} 
                    item={item} 
                    type={activeView as "live" | "movie" | "series"} 
                    primaryColor={primaryColor} 
                    onClick={(i) => {
                      debugClick(i, activeView as "live" | "movie" | "series");
                      if (activeView === "live") {
                        handlePlay(i.stream_id, "live");
                      } else {
                        setSelectedItem(i);
                        setIsDetailsOpen(true);
                      }
                    }}

                  />
                ))}

              </div>
            )}
            {!loadingContent && content.length >= 40 && (
              <div className="flex justify-center pt-8">
                <Button 
                  variant="outline" 
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10"
                  onClick={async () => {
                    const actionMap = { live: "get_live_streams", movie: "get_vod_streams", series: "get_series" } as const;
                    const action = actionMap[activeView as keyof typeof actionMap];
                    const moreData = await getPlayerCatalog({ 
                      data: { 
                        token: token!, 
                        action, 
                        categoryId: selectedCategory || undefined,
                        offset: content.length,
                        limit: 40
                      } 
                    });
                    if (Array.isArray(moreData)) {
                      setContent(prev => [...prev, ...moreData]);
                    }
                  }}
                >
                  Carregar Mais
                </Button>
              </div>
            )}
          </div>
        )}

      </main>

      {selectedItem && (
        <ContentDetailsOverlay 
          item={selectedItem}
          type={(selectedItem.series_id || selectedItem.content_type === "series" || activeView === "series") ? "series" : "movie"}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedItem(null);
          }}
          onPlay={(i: any) => {
            const isSeries = i.series_id || i.content_type === "series" || activeView === "series" || selectedItem.series_id;
            setIsDetailsOpen(false);
            if (isSeries) {
              handleOpenSeries(i);
            } else {
              handlePlay(i.stream_id || i.id || i.content_id, "movie");
            }
          }}
          primaryColor={primaryColor}
          isFavorite={favorites.some(f => f.content_id === (selectedItem.stream_id || selectedItem.series_id || selectedItem.id || selectedItem.content_id).toString())}
          onToggleFavorite={() => handleToggleFavorite(selectedItem)}
        />
      )}

      {/* Overlays */}

      <SearchOverlay 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)}
        token={token!}
        primaryColor={primaryColor}
        onPlay={(item: any, type: "live" | "movie" | "series") => {
          if (type === "live") {
            handlePlay(item.stream_id || item.id, "live");
          } else {
            setSelectedItem(item);
            setIsDetailsOpen(true);
            setIsSearchOpen(false);
          }
        }}

      />

      
      {selectedSeriesInfo && (
        <SeriesDetails 
          series={selectedSeriesInfo.info}
          info={selectedSeriesInfo}
          loading={loadingSeries}
          onClose={() => setSelectedSeriesInfo(null)}
          onPlay={(ep) => handlePlay(ep.id, "series", ep.container_extension)}
          primaryColor={primaryColor}
        />
      )}

      {/* Video Player */}
      {isPlaying && (
        <div className="fixed inset-0 z-[100] bg-black">
          <div className="absolute top-6 left-6 z-10">
             <Button variant="ghost" onClick={handleClosePlayer} className="bg-black/40 hover:bg-black/60 text-white rounded-full h-12 w-12 p-0">
               <X className="h-6 w-6" />
             </Button>
          </div>
          <div className="h-full w-full flex items-center justify-center">
             {!streamUrl ? (
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             ) : (
                <video 
                  ref={videoRef}
                  className="w-full h-full"
                  controls
                  autoPlay
                  playsInline
                />
             )}
          </div>
        </div>
      )}
    </div>
  );

  function debugClick(item: any, type: "live" | "movie" | "series") {
    console.log("[PLAYER_DEBUG] clique", {
      tipo: type,
      content_id: (item?.stream_id ?? item?.series_id ?? item?.id ?? item?.content_id) ?? null,
      server_id: session?.server_id ?? null,
      nome: item?.name ?? item?.title ?? null,
      item,
    });
  }

  function handlePlay(id: string, type: "live" | "movie" | "series", extOverride?: string) {
    setIsPlaying(true);
    setStreamUrl(null);

    // Live → HLS (.m3u8) é o formato reproduzível no navegador.
    // Filmes/Séries → extensão real do container (mp4 por padrão) com Range.
    const extension = type === "live" ? "m3u8" : (extOverride || "mp4");

    console.log("[PLAYER_DEBUG] play", {
      tipo: type,
      content_id: id,
      server_id: session?.server_id ?? null,
      extensao: extension,
      endpoint: "server fn getPlayerStreamUrl -> /api/public/core/stream",
      core_aws: "definido no servidor (CORE_API_URL)",
    });

    getPlayerStreamUrl({
      data: {
        token: token!,
        streamId: id.toString(),
        type,
        extension,
      }
    })
    .then(url => {
      console.log("[PLAYER_DEBUG] URL de reprodução (proxy):", url, "| tipo:", type, "| ext:", extension, "| status: ok");
      setStreamUrl(url);
    })
    .catch(err => {
      console.error("[PLAYER_DEBUG] falha ao gerar URL de stream", {
        tipo: type,
        content_id: id,
        endpoint: "getPlayerStreamUrl",
        mensagem: err?.message,
        stack: err?.stack,
      });
      toast.error(`Erro real ao reproduzir: ${err?.message ?? "desconhecido"}`);
      setIsPlaying(false);
    });
  }


  async function handleOpenSeries(item: any) {
    const seriesId = (item.series_id || item.id || item.content_id)?.toString();
    if (!seriesId) {
      console.error("[PLAYER_DEBUG] ID da série não encontrado no item:", item);
      toast.error("Identificador da série inválido.");
      return;
    }

    const start = Date.now();
    console.log("[PLAYER_DEBUG] abrir série", {
      tipo: "series",
      content_id: seriesId,
      server_id: session?.server_id ?? null,
      nome: item.name || item.title,
      endpoint: "getPlayerCatalog(action=get_episodes_list)",
    });
    
    setSelectedSeriesInfo({ info: item, episodes: {} });
    setLoadingSeries(true);
    setIsDetailsOpen(false);
    
    try {
      const data = await getPlayerCatalog({ 
        data: { 
          token: token!, 
          action: "get_episodes_list", 
          contentId: seriesId
        } 
      });

      console.log(`[PLAYER_DEBUG] resposta série em ${Date.now() - start}ms:`, {
        tem_info: !!data?.info,
        tem_episodes: !!data?.episodes,
        num_temporadas: data?.episodes ? Object.keys(data.episodes).length : 0,
        resposta: data,
      });

      if (!data || (!data.episodes && !data.info)) {
        throw new Error("Resposta da API vazia ou inválida (get_episodes_list/get_series_info)");
      }

      setSelectedSeriesInfo(data);
    } catch (err: any) {
      console.error("[PLAYER_DEBUG] erro ao carregar série", {
        content_id: seriesId,
        mensagem: err?.message,
        stack: err?.stack,
      });
      toast.error(`Erro real: ${err?.message ?? "falha ao carregar episódios"}`);
    } finally {
      setLoadingSeries(false);
    }
  }


  function handleClosePlayer() {
    setIsPlaying(false);
    setStreamUrl(null);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }

  // Efeito para inicializar Hls.js ou Video Nativo
  useEffect(() => {
    if (!isPlaying || !streamUrl || !videoRef.current) return;
    const video = videoRef.current;
    const isHls = streamUrl.includes("ext=m3u8") || streamUrl.includes(".m3u8");

    // Diagnóstico da camada de playback
    const logMeta = async () => {
      try {
        const res = await fetch(streamUrl, { headers: isHls ? {} : { Range: "bytes=0-1023" } });
        console.log(
          "[player] proxy status:", res.status,
          "| Content-Type:", res.headers.get("content-type"),
          "| Content-Length:", res.headers.get("content-length"),
          "| Content-Range:", res.headers.get("content-range")
        );
        if (!res.ok && res.status !== 206) {
          toast.error(`Stream indisponível (HTTP ${res.status})`);
        }
        await res.body?.cancel();
      } catch (e) {
        console.error("[player] falha ao consultar o proxy de stream:", e);
      }
    };
    void logMeta();

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("[player] manifesto HLS carregado, iniciando reprodução");
        video.play().catch((e) => console.error("Auto-play bloqueado", e));
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error("[player] HLS error", data.type, data.details, data.fatal);
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else {
          toast.error("Erro no stream de vídeo");
          hls.destroy();
        }
      });
    } else {
      // Nativo: Safari/iOS (HLS) e Filmes/Séries (mp4/mkv com Range)
      video.src = streamUrl;
      const onLoaded = () => video.play().catch((e) => console.error("Auto-play bloqueado", e));
      const onError = () => {
        console.error("[player] erro no elemento <video>", video.error);
        toast.error("Não foi possível reproduzir este conteúdo (formato não suportado pelo navegador).");
      };
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("error", onError);
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("error", onError);
      };
    }
  }, [isPlaying, streamUrl]);


}


function LoginForm({ resellerId, settings, onLogin, primaryColor, secondaryColor }: any) {
  const [username, setUsername] = useState(localStorage.getItem(`stream_player_last_user_${resellerId}`) || "");
  const [password, setPassword] = useState("");
  const [serverId, setServerId] = useState(localStorage.getItem(`stream_player_last_server_${resellerId}`) || "");
  const [servers, setServers] = useState<any[]>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [healthInfo, setHealthInfo] = useState<any>(null);

  useEffect(() => {
    getPlayerServers({ data: { resellerId } })
      .then((list: any) => setServers(list || []))
      .catch(() => setServers([]));
  }, [resellerId]);

  // Diagnóstico automático ao trocar de servidor
  useEffect(() => {
    if (serverId) {
      setDiagnosing(true);
      setHealthInfo(null);
      import("@/lib/player.functions").then(({ checkServerHealth }) => {
        checkServerHealth({ data: { serverId } })
          .then(info => setHealthInfo(info))
          .finally(() => setDiagnosing(false));
      });
    }
  }, [serverId]);

  const loginMutation = useMutation({
    mutationFn: loginXtreamClient,
    onSuccess: (data: any) => {
      onLogin(data);
      toast.success("Login realizado com sucesso!");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao conectar")
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) return toast.error("Selecione o servidor");
    loginMutation.mutate({ data: { serverId, username, password, resellerId } });
    localStorage.setItem(`stream_player_last_server_${resellerId}`, serverId);
    localStorage.setItem(`stream_player_last_user_${resellerId}`, username);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundColor: secondaryColor }}>
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
      </div>

      <Card className="w-full max-w-[400px] bg-black/40 backdrop-blur-xl border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: primaryColor }} />
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="mx-auto h-20 w-20 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <PlayCircle className="h-10 w-10" style={{ color: primaryColor }} />
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{settings?.brand_name || "Web Player"}</h1>
              <p className="text-sm text-white/60 mt-1">{settings?.welcome_message || "Entre com suas credenciais."}</p>
            </div>
          </div>

          <div className="space-y-4">
             <div className="space-y-2">
               <Label className="text-white/70 text-xs">Servidor</Label>
               <select 
                 className="w-full h-11 bg-white/5 border border-white/10 rounded-lg px-3 text-white focus:ring-2 focus:ring-primary/50 outline-none"
                 value={serverId}
                 onChange={(e) => setServerId(e.target.value)}
                 required
               >
                 <option value="" className="bg-neutral-900">Escolha o servidor...</option>
                 {servers.map(s => <option key={s.id} value={s.id} className="bg-neutral-900">{s.name || s.host}</option>)}
               </select>

               {serverId && (
                 <div className="flex items-center gap-2 px-1">
                   {diagnosing ? (
                     <div className="flex items-center gap-2 text-[10px] text-white/40 animate-pulse">
                       <Loader2 className="h-3 w-3 animate-spin" /> Verificando conexão...
                     </div>
                   ) : healthInfo ? (
                     <div className={cn(
                       "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
                       healthInfo.status === 'stable' ? "text-emerald-400" : (healthInfo.status === 'unstable' ? "text-amber-400" : "text-red-400")
                     )}>
                       <span className={cn("h-1.5 w-1.5 rounded-full", 
                         healthInfo.status === 'stable' ? "bg-emerald-400" : (healthInfo.status === 'unstable' ? "bg-amber-400" : "bg-red-400")
                       )} />
                       {healthInfo.status === 'stable' ? "Conexão normal" : (healthInfo.status === 'unstable' ? "Instabilidade detectada" : "Servidor indisponível")}
                       {healthInfo.healthScore !== null && <span className="opacity-50">| Saúde: {healthInfo.healthScore}%</span>}
                     </div>
                   ) : null}
                 </div>
               )}
             </div>
             
             <div className="space-y-2">
               <Label className="text-white/70 text-xs">Usuário</Label>
               <Input 
                 placeholder="Usuário IPTV" 
                 value={username} 
                 onChange={e => setUsername(e.target.value)}
                 className="bg-white/5 border-white/10 h-11 text-white" 
                 required
               />
             </div>

             <div className="space-y-2">
               <Label className="text-white/70 text-xs">Senha</Label>
               <Input 
                 type="password"
                 placeholder="Senha IPTV" 
                 value={password} 
                 onChange={e => setPassword(e.target.value)}
                 className="bg-white/5 border-white/10 h-11 text-white" 
                 required
               />
             </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 font-bold text-lg" 
            style={{ backgroundColor: primaryColor }}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Play className="h-5 w-5 mr-2 fill-white" />
            )}
            Acessar Agora
          </Button>

          <p className="text-center text-[10px] text-white/20 uppercase tracking-widest">
            Powered by StreamMonitor.site
          </p>
        </form>
      </Card>
    </div>
  );
}
