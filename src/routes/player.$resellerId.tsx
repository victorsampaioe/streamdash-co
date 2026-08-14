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
  toggleFavorite
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
  Plus
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
  const [activeView, setActiveView] = useState<"home" | "live" | "movie" | "series" | "mylist" | "search" | "settings">("home");

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
      const data = variables.data as any;
      const { contentId, contentType, isFavorite } = data;
      if (isFavorite) {
        setFavorites(prev => [...prev, { content_id: contentId, content_type: contentType }]);
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
      // Fetch initial data for rows
      const fetchHome = async () => {
        try {
          // Em um cenário real, teríamos endpoints otimizados para a Home.
          // Aqui simulamos buscando as primeiras categorias de cada tipo.
          const vodCats = await getPlayerCatalog({ data: { token, action: "get_vod_categories" } });
          if (Array.isArray(vodCats) && vodCats.length > 0) {
            const firstCat = vodCats[0];
            const vods = await getPlayerCatalog({ data: { token, action: "get_vod_streams", categoryId: firstCat.category_id } });
            const list = Array.isArray(vods) ? vods : [];
            setHomeData(prev => ({ 
              ...prev, 
              featured: list[0] || null,
              newReleases: list.slice(1, 15)
            }));
          }

          const liveCats = await getPlayerCatalog({ data: { token, action: "get_live_categories" } });
          if (Array.isArray(liveCats) && liveCats.length > 0) {
            const firstCat = liveCats[0];
            const lives = await getPlayerCatalog({ data: { token, action: "get_live_streams", categoryId: firstCat.category_id } });
            setHomeData(prev => ({ 
              ...prev, 
              liveHighlights: Array.isArray(lives) ? lives.slice(0, 10) : []
            }));
          }
        } catch (err) {
          console.error("Error loading home data", err);
        } finally {
          setLoadingContent(false);
        }
      };
      fetchHome();
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

  // Carregar conteúdo por categoria
  useEffect(() => {
    if (session && token && selectedCategory && ["live", "movie", "series"].includes(activeView)) {
      setLoadingContent(true);
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const actionMap = {
        live: "get_live_streams",
        movie: "get_vod_streams",
        series: "get_series"
      } as const;
      
      const action = actionMap[activeView as keyof typeof actionMap];


      getPlayerCatalog({ data: { token, action, categoryId: selectedCategory } })
        .then((data: any) => {
          if (!controller.signal.aborted) {
            setContent(Array.isArray(data) ? data : []);
          }
        })
        .catch((err: any) => {
          if (!controller.signal.aborted) {
            setContent([]);
            toast.error(err?.message || "Não foi possível carregar os conteúdos");
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoadingContent(false);
          }
        });
        
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
          else setActiveView(v);
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
            />

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
              title="Destaques Ao Vivo" 
              items={homeData.liveHighlights} 
              type="live" 
              primaryColor={primaryColor}
              onPlay={(item: any) => handlePlay(item.stream_id, "live")}
            />

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

          </div>
        )}

      </main>

      {selectedItem && (
        <ContentDetailsOverlay 
          item={selectedItem}
          type={activeView === "series" || selectedItem.series_id ? "series" : "movie"}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedItem(null);
          }}
          onPlay={(i: any) => {
            const isSeries = activeView === "series" || i.series_id || selectedItem.series_id;
            if (isSeries) {
              handleOpenSeries(i);
            } else {
              handlePlay(i.stream_id || i.id, "movie");
            }
            setIsDetailsOpen(false);
          }}
          primaryColor={primaryColor}
          isFavorite={favorites.some(f => f.content_id === (selectedItem.stream_id || selectedItem.series_id || selectedItem.id).toString())}
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

  function handlePlay(id: string, type: "live" | "movie" | "series", extOverride?: string) {
    setIsPlaying(true);
    setStreamUrl(null);

    // Live → HLS (.m3u8) é o formato reproduzível no navegador.
    // Filmes/Séries → extensão real do container (mp4 por padrão) com Range.
    const extension = type === "live" ? "m3u8" : (extOverride || "mp4");

    getPlayerStreamUrl({
      data: {
        token: token!,
        streamId: id.toString(),
        type,
        extension,
      }
    })
    .then(url => {
      console.log("[player] URL de reprodução (proxy):", url, "| tipo:", type, "| ext:", extension);
      setStreamUrl(url);
    })
    .catch(err => {
      console.error("[player] falha ao gerar URL de stream:", err);
      const msg = err.message || "";
      if (msg.includes("403")) {
        toast.error("Acesso bloqueado pelo servidor (Cloudflare/WAF).");
      } else if (msg.includes("timeout") || msg.includes("504")) {
        toast.error("O servidor demorou muito para responder. Tente novamente.");
      } else {
        toast.error("Identificamos instabilidade no servidor. Nossa equipe já foi informada.");
      }
      setIsPlaying(false);
    });
  }


  function handleOpenSeries(item: any) {
    setSelectedSeriesInfo({ info: item, episodes: {} });
    setLoadingSeries(true);
    
    getPlayerCatalog({ 
      data: { 
        token: token!, 
        action: "get_series_info", 
        contentId: item.series_id 
      } 
    })
    .then((data: any) => {
      setSelectedSeriesInfo(data);
    })
    .catch(() => toast.error("Erro ao carregar episódios"))
    .finally(() => setLoadingSeries(false));
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
