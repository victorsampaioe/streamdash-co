import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  getPlayerSettings, 
  loginXtreamClient, 
  getPlayerCatalog, 
  validatePlayerSession,
  getPlayerStreamUrl 
} from "@/lib/player.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";
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
  List,
  Calendar,
  Star,
  Clock,
  ChevronLeft,
  X,
  Plus,
  PlayCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Hls from "hls.js";


export const Route = createFileRoute("/player/$resellerId")({
  component: PlayerPage,
});

function PlayerPage() {
  const navigate = useNavigate();
  const { resellerId } = Route.useParams();
  const [token, setToken] = useState<string | null>(localStorage.getItem(`stream_player_token_${resellerId}`));
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"live" | "vod" | "series">("live");
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [content, setContent] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [selectedSeriesInfo, setSelectedSeriesInfo] = useState<any>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
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

  // Carregar categorias
  useEffect(() => {
    if (session && token) {
      const actionMap = {
        live: "get_live_categories",
        vod: "get_vod_categories",
        series: "get_series_categories"
      } as const;
      
      getPlayerCatalog({ data: { token, action: actionMap[activeTab] } })
        .then((data: any) => {
          const list = Array.isArray(data) ? data : [];
          setCategories(list);
          setSelectedCategory(null);
          if (list.length === 0) toast.info("Nenhuma categoria disponível nesta seção.");
        })
        .catch((err: any) => {
          setCategories([]);
          toast.error(err?.message || "Não foi possível carregar o catálogo");
        });
    }
  }, [session, token, activeTab]);

  // Carregar conteúdo por categoria
  useEffect(() => {
    if (session && token && selectedCategory) {
      setLoadingContent(true);
      
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const actionMap = {
        live: "get_live_streams",
        vod: "get_vod_streams",
        series: "get_series"
      } as const;
      
      getPlayerCatalog({ data: { token, action: actionMap[activeTab], categoryId: selectedCategory } })
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
    } else {
      setContent([]);
    }
  }, [session, token, activeTab, selectedCategory]);

  const primaryColor = settings?.primary_color || "#3B82F6";
  const secondaryColor = settings?.secondary_color || "#0A0A0A";

  if (settingsLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-black/40 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          {settings?.logo_url && (
            <img src={settings.logo_url} alt="Logo" className="h-8 w-auto" />
          )}
          <span className="font-bold text-lg hidden sm:block">{settings?.brand_name || "Stream Player"}</span>
        </div>
        
        <nav className="flex items-center gap-1 sm:gap-4">
          <Button 
            variant="ghost" 
            className={`gap-2 ${activeTab === "live" ? "text-primary bg-primary/10" : "text-white/60"}`}
            onClick={() => setActiveTab("live")}
          >
            <Tv className="h-4 w-4" /> <span className="hidden sm:inline">TV Ao Vivo</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`gap-2 ${activeTab === "vod" ? "text-primary bg-primary/10" : "text-white/60"}`}
            onClick={() => setActiveTab("vod")}
          >
            <Film className="h-4 w-4" /> <span className="hidden sm:inline">Filmes</span>
          </Button>
          <Button 
            variant="ghost" 
            className={`gap-2 ${activeTab === "series" ? "text-primary bg-primary/10" : "text-white/60"}`}
            onClick={() => setActiveTab("series")}
          >
            <Play className="h-4 w-4" /> <span className="hidden sm:inline">Séries</span>
          </Button>
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full text-xs">
            <User className="h-3 w-3 text-primary" />
            <span className="max-w-[100px] truncate">{session.xtream_user}</span>
          </div>
          <Button variant="ghost" size="icon" className="text-white/40 hover:text-red-500" onClick={() => setToken(null)}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Categorias Mobile (Overlay) */}
        <div className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity ${selectedCategory === null ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={() => setSelectedCategory('0')}></div>
        
        {/* Sidebar Categorias */}
        <aside className={`w-64 border-r border-white/5 bg-black/20 overflow-y-auto transition-transform md:translate-x-0 z-50 md:static fixed inset-y-0 left-0 ${selectedCategory === null ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between px-2 mb-4">
              <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Categorias</h3>
              {selectedCategory !== null && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] md:hidden" onClick={() => setSelectedCategory(null)}>
                  <ChevronLeft className="h-3 w-3 mr-1" /> Voltar
                </Button>
              )}
            </div>
            {categories.map((cat) => (
              <button
                key={cat.category_id}
                onClick={() => setSelectedCategory(cat.category_id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === cat.category_id 
                    ? "bg-primary text-white font-bold" 
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
                style={selectedCategory === cat.category_id ? { backgroundColor: primaryColor } : {}}
              >
                {cat.category_name}
              </button>
            ))}
          </div>
        </aside>

        {/* Conteúdo Principal */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {selectedCategory !== null && (
             <Button 
               variant="ghost" 
               size="sm" 
               className="mb-4 md:hidden text-white/60" 
               onClick={() => setSelectedCategory(null)}
             >
               <ChevronLeft className="h-4 w-4 mr-1" /> Ver Categorias
             </Button>
          )}
          
          {selectedCategory === null ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
              <LayoutGrid className="h-16 w-16" />
              <div>
                <h2 className="text-xl font-bold">Selecione uma categoria</h2>
                <p className="text-sm">Escolha ao lado para começar a assistir</p>
              </div>
            </div>
          ) : loadingContent ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <h2 className="text-2xl font-bold">
                  {categories.find(c => c.category_id === selectedCategory)?.category_name}
                </h2>
                <div className="flex gap-2">
                   <div className="relative flex-1 md:flex-none">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                     <Input className="bg-white/5 border-white/10 pl-9 w-full md:w-64 h-9 text-sm" placeholder="Buscar..." />
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {content.map((item) => (
                  <ContentCard 
                    key={item.stream_id || item.series_id} 
                    item={item} 
                    type={activeTab} 
                    primaryColor={primaryColor} 
                    onClick={() => {
                      if (activeTab === "live") {
                        handlePlay(item.stream_id, "live");
                      } else if (activeTab === "vod") {
                        setSelectedContent(item);
                      } else if (activeTab === "series") {
                        handleOpenSeries(item);
                      }
                    }}
                  />
                ))}
              </div>
              
              {content.length === 0 && (
                <div className="py-20 text-center opacity-40">
                  Nenhum conteúdo encontrado nesta categoria.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modal de Detalhes (Filmes/Séries) */}
      <Dialog open={!!selectedContent && !isPlaying} onOpenChange={(open) => !open && setSelectedContent(null)}>
        <DialogContent className="max-w-3xl bg-neutral-900 border-white/10 text-white p-0 overflow-hidden">
          {selectedContent && (
            <div className="flex flex-col md:flex-row">
              <div className="w-full md:w-1/3 aspect-[2/3] relative">
                <img 
                  src={selectedContent.stream_icon || selectedContent.cover} 
                  alt={selectedContent.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 p-6 space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">{selectedContent.name}</DialogTitle>
                  <div className="flex items-center gap-3 text-sm text-white/60">
                    <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> {selectedContent.rating || "N/A"}</span>
                    {selectedContent.year && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {selectedContent.year}</span>}
                  </div>
                </DialogHeader>
                
                <p className="text-sm leading-relaxed text-white/80 line-clamp-6">
                  {selectedContent.plot || "Nenhuma sinopse disponível para este título."}
                </p>

                <div className="pt-4 flex gap-3">
                  <Button 
                    className="flex-1 font-bold h-12" 
                    style={{ backgroundColor: primaryColor }}
                    onClick={() => handlePlay(selectedContent.stream_id || selectedContent.series_id, activeTab === "series" ? "series" : "movie")}
                  >
                    <Play className="mr-2 h-5 w-5 fill-white" /> Assistir Agora
                  </Button>
                </div>
              </div>
              <button 
                onClick={() => setSelectedContent(null)}
                className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Séries (Temporadas/Episódios) */}
      <Dialog open={!!selectedSeriesInfo && !isPlaying} onOpenChange={(open) => !open && setSelectedSeriesInfo(null)}>
        <DialogContent className="max-w-4xl bg-neutral-900 border-white/10 text-white p-0 overflow-hidden flex flex-col h-[80vh]">
          {selectedSeriesInfo && (
            <>
              <div className="flex flex-col md:flex-row border-b border-white/5 bg-black/40">
                <div className="w-full md:w-48 aspect-[2/3] relative">
                  <img 
                    src={selectedSeriesInfo.info?.cover || selectedSeriesInfo.info?.stream_icon} 
                    alt={selectedSeriesInfo.info?.name} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 p-6">
                  <DialogHeader>
                    <div className="flex justify-between items-start">
                      <DialogTitle className="text-2xl font-bold">{selectedSeriesInfo.info?.name}</DialogTitle>
                      <button onClick={() => setSelectedSeriesInfo(null)} className="md:hidden text-white/40"><X className="h-5 w-5" /></button>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-white/60 mt-2">
                      <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> {selectedSeriesInfo.info?.rating || "N/A"}</span>
                      {selectedSeriesInfo.info?.releaseDate && <span>{selectedSeriesInfo.info.releaseDate}</span>}
                    </div>
                  </DialogHeader>
                  <p className="text-sm text-white/70 mt-4 line-clamp-3">{selectedSeriesInfo.info?.plot}</p>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                {loadingSeries ? (
                  <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-8">
                    {Object.keys(selectedSeriesInfo.episodes || {}).map((seasonNum) => (
                      <div key={seasonNum} className="space-y-4">
                        <h4 className="text-lg font-bold flex items-center gap-2">
                          Temporada {seasonNum}
                          <span className="text-xs font-normal text-white/40">{selectedSeriesInfo.episodes[seasonNum].length} episódios</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedSeriesInfo.episodes[seasonNum].map((ep: any) => (
                            <button
                              key={ep.id}
                              onClick={() => handlePlay(ep.id, "series", ep.container_extension || "mp4")}
                              className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/50 transition-all text-left group"
                            >
                              <div className="relative w-24 aspect-video rounded bg-black flex-shrink-0 overflow-hidden">
                                <img src={ep.info?.movie_image || selectedSeriesInfo.info?.cover} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Play className="h-6 w-6 fill-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">E{ep.episode_num}. {ep.title}</div>
                                <div className="text-xs text-white/40 flex items-center gap-2 mt-1">
                                  <Clock className="h-3 w-3" /> {ep.info?.duration || "--:--"}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          <button 
            onClick={() => setSelectedSeriesInfo(null)}
            className="absolute top-4 right-4 hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-black/40 hover:bg-black/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogContent>
      </Dialog>

      {/* Player de Vídeo Fullscreen Overlay */}
      {isPlaying && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 w-full z-10">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleClosePlayer} className="text-white hover:bg-white/10">
                <X className="h-6 w-6" />
              </Button>
              <h2 className="font-bold">{selectedContent?.name || "Reproduzindo..."}</h2>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative group">
            {!streamUrl ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" style={{ color: primaryColor }} />
                <p className="text-sm opacity-50">Preparando stream...</p>
              </div>
            ) : (
              <video 
                ref={videoRef}
                className="w-full h-full object-contain"
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
    
    getPlayerStreamUrl({ 
      data: { 
        token: token!, 
        streamId: id.toString(), 
        type, 
        extension: extOverride || (type === "live" ? "ts" : "mp4") 
      } 
    })
    .then(url => {
      setStreamUrl(url);
    })
    .catch(err => {
      toast.error("Erro ao carregar vídeo: " + err.message);
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
    if (isPlaying && streamUrl && videoRef.current) {
      const video = videoRef.current;
      
      // Se for .ts ou HLS, tentamos Hls.js
      if (Hls.isSupported() && (streamUrl.includes(".ts") || streamUrl.includes(".m3u8") || streamUrl.includes("type=live") || streamUrl.includes("ext=ts"))) {
        const hls = new Hls({
          xhrSetup: (xhr) => {
            xhr.withCredentials = false;
          }
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.error("Auto-play blocked", e));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error("HLS fatal error", data);
            toast.error("Erro no stream de vídeo");
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Nativo para Safari/iOS
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play();
        });
      } else {
        // Fallback direto (Filmes mp4/mkv)
        video.src = streamUrl;
      }
    }
  }, [isPlaying, streamUrl]);
}

function ContentCard({ item, type, primaryColor, onClick }: { item: any, type: string, primaryColor: string, onClick: () => void }) {
  const name = item.name || item.title;
  const image = item.stream_icon || item.cover;
  
  return (
    <div 
      onClick={onClick}
      className="group relative aspect-[2/3] bg-white/5 rounded-xl overflow-hidden border border-white/10 hover:border-primary/50 transition-all cursor-pointer"
    >
      {image ? (
        <img src={image} alt={name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
           {type === "live" ? <Tv className="h-8 w-8 opacity-20" /> : <Film className="h-8 w-8 opacity-20" />}
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
        <h4 className="font-bold text-sm line-clamp-2">{name}</h4>
        <div 
          className="mt-2 h-8 w-8 rounded-full flex items-center justify-center self-end shadow-lg"
          style={{ backgroundColor: primaryColor }}
        >
          <Play className="h-4 w-4 fill-white" />
        </div>
      </div>
      
      {type === "live" && (
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded uppercase tracking-tighter">AO VIVO</div>
      )}
    </div>
  );
}

function LoginForm({ resellerId, settings, onLogin, primaryColor, secondaryColor }: any) {
  const [username, setUsername] = useState(localStorage.getItem(`stream_player_last_user_${resellerId}`) || "");
  const [password, setPassword] = useState("");
  const [serverId, setServerId] = useState(localStorage.getItem(`stream_player_last_server_${resellerId}`) || "");
  const [servers, setServers] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("servers")
      .select("id, name, host")
      .eq("owner_id", resellerId)
      .then(({ data }) => setServers(data || []));
  }, [resellerId]);

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
