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
  getTMDBMetadata,
  diagnosePlayerCatalog,
  getServerStatus,
  getPlayerActivity,
  updatePlayerActivity

} from "@/lib/player.functions";
import { CORE_STREAM_VERSION } from "@/lib/core-version";

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
  AlertCircle,
  PlayCircle,
  Settings as SettingsIcon,
  Plus,
  ArrowRight,
  TrendingUp,
  History,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert
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
import { BottomNav } from "@/components/player/BottomNav";
import { DiagnosticBadge } from "@/components/player/DiagnosticBadge";
import { isBrowserPlayable, incompatibleReason } from "@/lib/playback-format";
import { testWebCompatibility, NEEDS_CONVERSION_MESSAGE, type WebCompatResult } from "@/lib/web-compat";
import { AppDownloadCard } from "@/components/player/AppDownloadCard";
import { TrailerModal } from "@/components/player/TrailerModal";
import { curateHero, curateHdReleases, curateRecent, curateTopRated } from "@/lib/player-curation";

const SMART_LOADING_MESSAGES = [
  "Conectando...",
  "Verificando servidor...",
  "Analisando estabilidade...",
  "Otimizando a reprodução...",
];






export const Route = createFileRoute("/player/$resellerId")({
  loader: async ({ params, context }) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.resellerId);
    
    // Se for UUID, busca por profileId. Se não for, busca por slug.
    const settings = await getPlayerSettings({ 
      data: isUuid ? { profileId: params.resellerId } : { slug: params.resellerId } 
    });
    
    if (!settings) {
      return { settings: null };
    }
    return { settings };
  },
  component: PlayerPage,
});

function PlayerPage() {
  const navigate = useNavigate();
  const { resellerId } = Route.useParams();
  const { settings } = Route.useLoaderData();
  const profileId = settings?.profile_id || resellerId;
  const primaryColor = settings?.primary_color || "#3B82F6";
  const secondaryColor = settings?.secondary_color || "#0A0A0A";
  
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  
  useEffect(() => {
    if (typeof window !== "undefined" && profileId) {
      const savedToken = localStorage.getItem(`stream_player_token_${profileId}`);
      if (savedToken) setToken(savedToken);
    }
  }, [profileId]);
  const [activeView, setActiveView] = useState<"home" | "live" | "movie" | "series" | "mylist" | "search" | "settings">("home");
  const [loadingContent, setLoadingContent] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [content, setContent] = useState<any[]>([]);
  
  const [selectedSeriesInfo, setSelectedSeriesInfo] = useState<any>(null);
  const [isSeriesOpen, setIsSeriesOpen] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [smartMsgIndex, setSmartMsgIndex] = useState(0);
  const [playbackReason, setPlaybackReason] = useState<string | null>(null);

  // Mensagens inteligentes durante a conexão + trava de scroll no modo player
  useEffect(() => {
    if (!isPlaying || streamUrl) {
      setSmartMsgIndex(0);
      return;
    }
    const id = setInterval(() => {
      setSmartMsgIndex((i) => Math.min(i + 1, SMART_LOADING_MESSAGES.length - 1));
    }, 2200);
    return () => clearInterval(id);
  }, [isPlaying, streamUrl]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = isPlaying ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isPlaying]);

  // HUD temporário de diagnóstico de reprodução (remover após validação)
  const [playbackDebug, setPlaybackDebug] = useState<any>(null);
  // Versão do Frontend (para conferência em produção)
  const [feVersion] = useState("2026.08.17-fe-v1");
  // Teste de compatibilidade Web (codec real analisado no Core)
  const [compat, setCompat] = useState<WebCompatResult | null>(null);
  const [compatLoading, setCompatLoading] = useState(false);
  const [showDebugHud, setShowDebugHud] = useState(false);
  const lastStreamUrlRef = useRef<string | null>(null);

  const runCompatTest = async (url?: string | null) => {
    const alvo = url ?? streamUrl ?? lastStreamUrlRef.current;
    if (!alvo) {
      toast.error("Abra um conteúdo antes de testar a compatibilidade.");
      return null;
    }
    setCompatLoading(true);
    try {
      const r = await testWebCompatibility(alvo);
      setCompat(r);
      setPlaybackDebug((prev: any) => ({
        ...(prev ?? {}),
        codec_video: r.video ?? prev?.codec_video,
        codec_audio: r.audio ?? prev?.codec_audio,
        acao: r.action,
      }));
      console.log("[COMPAT]", JSON.stringify(r));
      return r;
    } catch (e) {
      console.error("[COMPAT] falha no teste", e);
      toast.error("Não foi possível analisar o conteúdo agora.");
      return null;
    } finally {
      setCompatLoading(false);
    }
  };
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
    seriesHighlights: any[];
  }>({
    featured: null,
    continueWatching: [],
    newReleases: [],
    liveHighlights: [],
    seriesHighlights: []
  });

  // Filtro rápido local (catálogo já carregado)
  const [quickFilter, setQuickFilter] = useState("");
  // Trailer sob demanda (camada visual)
  const [trailerItem, setTrailerItem] = useState<any>(null);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [diag, setDiag] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);


  // Carregar favoritos e progresso
  useEffect(() => {
    if (token) {
      getPlayerActivity({ data: { token, type: 'favorites' } })
        .then(setFavorites)
        .catch(console.error);
        
      getPlayerActivity({ data: { token, type: 'history' } })
        .then(setHistory)
        .catch(console.error);
    }
  }, [token]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: (variables: { data: any }) => updatePlayerActivity(variables),
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
    const contentId = (item.stream_id || item.series_id || item.id || item.content_id).toString();
    const contentType = item.stream_type === "live" ? "live" : (item.series_id || item.content_type === "series" || item.content_type === "series" ? "series" : "movie");
    const isFavorite = favorites.some(f => f.content_id === contentId);
    
    toggleFavoriteMutation.mutate({
      data: {
        token,
        contentId,
        contentType,
        isFavorite: !isFavorite,
        metadata: {
          name: item.name || item.title,
          stream_icon: item.stream_icon || item.cover
        }
      }
    });
  };


  // Carregamento da Identidade Visual agora vem do loader
  // const primaryColor = settings?.primary_color || "#3B82F6";
  // const secondaryColor = settings?.secondary_color || "#0A0A0A";

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

  // Salvar token usando profile_id fixo
  useEffect(() => {
    if (typeof window !== "undefined" && profileId) {
      if (token) localStorage.setItem(`stream_player_token_${profileId}`, token);
      else localStorage.removeItem(`stream_player_token_${profileId}`);
    }
  }, [token, profileId]);

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
            const movies = Array.isArray(list) ? list : [];
            setHomeData(prev => ({ 
              ...prev, 
              featured: curateHero(movies, 1)[0] ?? movies[0] ?? null,
              newReleases: movies
            }));
          }

          // Buscar Canais Ao Vivo
          const liveCats = await getPlayerCatalog({ data: { token, action: "get_live_categories" } });
          if (Array.isArray(liveCats) && liveCats.length > 0) {
            const firstCat = liveCats[0];
            const list = await fetchItems("get_live_streams", firstCat.category_id);
            setHomeData(prev => ({ 
              ...prev, 
              liveHighlights: Array.isArray(list) ? list.slice(0, 12) : []
            }));
          }

          // Buscar Séries recentes
          const seriesCats = await getPlayerCatalog({ data: { token, action: "get_series_categories" } });
          if (Array.isArray(seriesCats) && seriesCats.length > 0) {
            const firstCat = seriesCats[0];
            const list = await fetchItems("get_series", firstCat.category_id);
            setHomeData(prev => ({ 
              ...prev, 
              seriesHighlights: Array.isArray(list) ? list : []
            }));
          }

          // Buscar Favoritos
          const favs = await getPlayerActivity({ data: { token, type: 'favorites' } });
          if (Array.isArray(favs)) {
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
      if (activeView === "search" || activeView === "settings") return;
      
      setLoadingContent(true);
      const controller = new AbortController();
      
      const fetchData = async () => {
        try {
          if (activeView === ("mylist" as any)) {
            const favs = await getPlayerActivity({ data: { token, type: 'favorites' } });
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

  // Duplicados removidos: primaryColor e secondaryColor já definidos via settings do loader

  const isAdmin = session?.user?.email?.includes("admin") || false;

  const { data: serverStatus } = useQuery({
    queryKey: ["player-server-status", token],
    queryFn: async () => {
      if (!token) return null;
      return await getServerStatus({ data: { token } });
    },
    enabled: !!token,
    refetchInterval: 60000,
  });


  // Efeito para inicializar Hls.js ou Video Nativo
  useEffect(() => {
    if (!isPlaying || !streamUrl || !videoRef.current) return;
    const video = videoRef.current;
    const isHls = streamUrl.includes("ext=m3u8") || streamUrl.includes(".m3u8");
    lastStreamUrlRef.current = streamUrl;

    // Diagnóstico da camada de playback (motivo real, não mensagem genérica)
    const logMeta = async () => {
      // Se não for admin, não precisamos do fetch de diagnóstico pesado aqui
      // pois o handlePlay já fez um probe leve.
      if (!isAdmin) return;

      const t0 = performance.now();
      try {
        const res = await fetch(streamUrl, {
          headers: isHls ? {} : { Range: "bytes=0-1023" },
          signal: AbortSignal.timeout(20_000),
        });
        const via = res.headers.get("x-playback-via");
        const reason = res.headers.get("x-playback-reason");
        const ms = Math.round(performance.now() - t0);
        let amostra = "";
        try {
          const buf = await res.clone().arrayBuffer();
          amostra = isHls
            ? new TextDecoder().decode(buf.slice(0, 200))
            : Array.from(new Uint8Array(buf.slice(0, 16))).map((b) => b.toString(16).padStart(2, "0")).join(" ");
        } catch { /* ignore */ }
        const info = {
          via: via ?? "desconhecido",
          status: res.status,
          contentType: res.headers.get("content-type"),
          contentLength: res.headers.get("content-length"),
          acceptRanges: res.headers.get("accept-ranges"),
          contentRange: res.headers.get("content-range"),
          ms,
          amostra,
          reason,
          core_erro: res.headers.get("x-core-error"),
          core_status: res.headers.get("x-core-status"),
          worker: res.headers.get("x-core-worker-version"),
          upstream: res.headers.get("x-upstream-status"),
          upstream_ct: res.headers.get("x-upstream-content-type"),
          codec_video: res.headers.get("x-playback-codec-video"),
          codec_audio: res.headers.get("x-playback-codec-audio"),
          acao: res.headers.get("x-playback-action"),
          url: streamUrl.replace(/(username|password|token)=[^&]*/gi, (_m, k) => `${k}=***`),
        };
        setPlaybackDebug((prev: any) => ({ ...(prev ?? {}), ...info }));
        console.log("[PLAY]", JSON.stringify({
          tipo: playbackDebug?.tipo ?? null,
          conteudo: selectedItem?.name ?? selectedItem?.title ?? null,
          stream_id: playbackDebug?.tipo === "series" ? null : playbackDebug?.contentId ?? null,
          episode_id: playbackDebug?.tipo === "series" ? playbackDebug?.contentId ?? null : null,
          url_gerada: info.url,
          via: info.via,
          status: info.status,
          erro: info.reason ?? null,
        }, null, 2));
        const acao = res.headers.get("x-playback-action");
        if (res.status === 415) {
          const msg = reason || incompatibleReason(res.headers.get("x-playback-incompatible"));
          setPlaybackReason(msg);
          setStreamUrl(null);
          toast.error(msg, { duration: 8000 });
        } else if (!res.ok && res.status !== 206) {
          const msg =
            reason ||
            (res.status === 403
              ? `Servidor bloqueou o acesso ao stream (403) via ${info.via}. Upstream: ${info.upstream ?? "-"}.`
              : `Stream indisponível (HTTP ${res.status}) via ${info.via}.`);
          setPlaybackReason(msg);
          setStreamUrl(null);
          toast.error(msg, { duration: 8000 });
        } else if (acao && acao !== "direct" && reason) {
          // Arquivo entregue corretamente (200/206), porém o codec real não é
          // decodificável pelo navegador (H265/AC3/DTS) — motivo real, não erro
          // de servidor. Requer remux/transcodificação pelo Core.
          setPlaybackReason(
            `${reason} (vídeo: ${info.codec_video ?? "?"} · áudio: ${info.codec_audio ?? "?"} · ação necessária: ${acao === "transcode" ? "transcodificar" : "remuxar"})`
          );
          setStreamUrl(null);
          toast.error("Codec não suportado pelo navegador — veja o diagnóstico.", { duration: 8000 });
        }
        await res.body?.cancel();
      } catch (e) {
        console.error("[player] falha ao consultar o proxy de stream:", e);
        const message = e instanceof Error && e.name === "TimeoutError"
          ? "O Core não respondeu ao stream em 20 segundos."
          : "Falha de rede ao acessar o stream pelo Core.";
        setPlaybackDebug((prev: any) => ({ ...(prev ?? {}), via: "erro", status: "falha", erro_video: message }));
        setPlaybackReason(message);
      }
    };
    void logMeta();


    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ 
        enableWorker: true, 
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        initialLiveManifestSize: 1,
        // Otimização VOD HLS
        maxBufferHole: 0.5,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        maxFragLookUpTolerance: 0.25,
        liveSyncDurationCount: 3,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("[player] manifesto HLS carregado, iniciando reprodução");
        video.play().catch((e) => console.error("Auto-play bloqueado", e));
        
        // Registrar atividade (Início)
        if (selectedItem) {
          updatePlayerActivity({
            data: {
              token: token!,
              contentId: (selectedItem.stream_id || selectedItem.id || selectedItem.content_id).toString(),
              contentType: selectedItem.stream_type === "live" ? "live" : (selectedItem.series_id ? "series" : "movie"),
              progress: 0,
              metadata: {
                name: selectedItem.name || selectedItem.title,
                stream_icon: selectedItem.stream_icon || selectedItem.cover
              }
            }
          }).catch(console.error);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error("[player] HLS error", data.type, data.details, data.fatal);
        setPlaybackDebug((prev: any) => ({ ...(prev ?? {}), erro_hls: `${data.type}/${data.details}${data.fatal ? " (fatal)" : ""}` }));
        if (!data.fatal) return;
        
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          console.warn("[player] Falha de rede no HLS, tentando recuperar...");
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          console.warn("[player] Falha de mídia no HLS, tentando recuperar...");
          hls.recoverMediaError();
        } else {
          const msg = `Falha fatal na reprodução do canal (${data.details}). O Core entregou o manifesto, porém o navegador não conseguiu decodificar o fluxo.`;
          setPlaybackReason(msg);
          toast.error(msg, { duration: 8000 });
          hls.destroy();
          setStreamUrl(null);
        }
      });

    } else {
      // Nativo: Safari/iOS (HLS) e Filmes/Séries (mp4/mkv com Range)
      video.src = streamUrl;
      
      // Otimização VOD nativo (MP4/MKV)
      video.preload = "auto";
      
      const onError = async () => {
        console.error("[player] erro no elemento <video>", video.error);
        setPlaybackDebug((prev: any) => ({
          ...(prev ?? {}),
          erro_video: `code=${video.error?.code ?? "?"} ${video.error?.message ?? ""}`.trim(),
        }));
        // Em vez de só reportar erro, analisamos o conteúdo no Core (codec real)
        const urlAtual = streamUrl;
        lastStreamUrlRef.current = urlAtual;
        const r = await runCompatTest(urlAtual);
        const msg =
          r && !r.ok
            ? `${NEEDS_CONVERSION_MESSAGE} — vídeo ${r.video ?? "?"} / áudio ${r.audio ?? "?"} (${r.action === "transcode" ? "transcodificação" : "remux"} no Core).`
            : "Não foi possível iniciar este conteúdo. Tente novamente.";
        setPlaybackReason(msg);
        setStreamUrl(null);
        toast.error(msg, { duration: 8000 });
      };
      video.addEventListener("loadedmetadata", () => {
        console.log("[player] metadados carregados, iniciando vídeo");
        
        // Ajuste de buffer para evitar travadas em VOD
        if (selectedItem?.stream_type !== "live") {
          // Tentar forçar o carregamento de mais dados inicialmente
          console.log("[player] VOD detectado, otimizando buffer");
        }
        
        video.play().catch((e) => console.error("Auto-play bloqueado", e));
        
        // Registrar atividade para vídeo nativo
        if (selectedItem && !isHls) {
          updatePlayerActivity({
            data: {
              token: token!,
              contentId: (selectedItem.stream_id || selectedItem.id || selectedItem.content_id).toString(),
              contentType: selectedItem.stream_type === "live" ? "live" : (selectedItem.series_id ? "series" : "movie"),
              progress: 0,
              metadata: {
                name: selectedItem.name || selectedItem.title,
                stream_icon: selectedItem.stream_icon || selectedItem.cover
              }
            }
          }).catch(console.error);
        }
      });


      const onTimeUpdate = () => {
        if (!selectedItem || selectedItem.stream_type === "live") return;
        const progress = Math.floor((video.currentTime / video.duration) * 100);
        // Atualiza a cada 5% ou ao final
        if (progress % 5 === 0 || progress > 98) {
           updatePlayerActivity({
            data: {
              token: token!,
              contentId: (selectedItem.stream_id || selectedItem.id || selectedItem.content_id).toString(),
              contentType: selectedItem.series_id ? "series" : "movie",
              progress,
              metadata: {
                name: selectedItem.name || selectedItem.title,
                stream_icon: selectedItem.stream_icon || selectedItem.cover
              }
            }
          }).catch(console.error);
        }
      };

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("error", onError);
      
      return () => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("error", onError);
      };
    }
  }, [isPlaying, streamUrl, selectedItem, token]);


  // Loader handled by TanStack Router loader, so this isn't strictly needed for settings,
  // but keeping a placeholder if needed for other global state
  const settingsLoading = false; 

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
    if (typeof window !== "undefined") {
      localStorage.removeItem(`stream_player_token_${resellerId}`);
    }
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
            setSelectedCategory(null);
            setContent([]);
          }
        }}
        brandName={settings?.brand_name ?? undefined}
        logoUrl={settings?.logo_url ?? undefined}
        onLogout={handleLogout}
        token={token!}
      />

      <BottomNav 
        activeView={activeView} 
        onChangeView={(v) => {
          if (v === "search") setIsSearchOpen(true);
          else {
            setActiveView(v);
            setSelectedCategory(null);
            setContent([]);
          }
        }}
        primaryColor={primaryColor}
      />



      <main className="flex-1 overflow-y-auto pb-24 md:pb-0 scroll-smooth">
        <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-white/5 md:hidden">
          <div className="flex items-center gap-2">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-6 w-auto" />
            ) : (
              <div className="h-6 w-6 rounded bg-primary flex items-center justify-center font-bold text-xs">S</div>
            )}
            <span className="font-bold text-sm tracking-tight truncate max-w-[120px]">
              {settings?.brand_name || "Stream Player"}
            </span>
          </div>
          
          <DiagnosticBadge 
            status={serverStatus?.current_status || 'unknown'}
            healthScore={serverStatus?.health_score}
            latency={serverStatus?.last_latency_ms}
            onClick={() => {
              setActiveView("settings");
              toast.info("Acessando diagnóstico detalhado...");
            }}
          />
        </header>

        {activeView === "home" && (

          <div className="p-6 md:p-12 space-y-12">
            <HeroBanner 
              item={homeData.featured} 
              items={[homeData.featured, ...homeData.newReleases.slice(0, 4)].filter(Boolean)}
              primaryColor={primaryColor}
              onPlay={(item: any) => {
                const type = item.stream_type === "series" ? "series" : (item.stream_type === "live" ? "live" : "movie");
                if (type === "live") {
                  handlePlay(item.stream_id || item.series_id, "live", item);
                } else {
                  setSelectedItem(item);
                  setIsDetailsOpen(true);
                }
              }}
              onMyList={(item: any) => handleToggleFavorite(item)}
              onDetails={(item: any) => {
                setSelectedItem(item);
                setIsDetailsOpen(true);
              }}
              isFavorite={(item: any) => favorites.some(f => f.content_id === (item?.stream_id || item?.series_id || item?.id)?.toString())}
            />


            {/* Continuar Assistindo Section */}
            {history.length > 0 && (
              <ContentRow 
                title="Continuar Assistindo" 
                items={history.map(h => ({
                  ...h,
                  stream_id: h.content_id,
                  name: h.metadata?.name || h.name || `Item ${h.content_id}`,
                  stream_icon: h.metadata?.stream_icon || h.stream_icon,
                  stream_type: h.content_type
                }))} 
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
                items={favorites.map(f => ({
                  ...f,
                  stream_id: f.content_id,
                  name: f.metadata?.name || f.name || `Item ${f.content_id}`,
                  stream_icon: f.metadata?.stream_icon || f.stream_icon,
                  stream_type: f.content_type
                }))} 
                type="movie" 
                primaryColor={primaryColor}
                onPlay={(item: any) => {
                  setSelectedItem(item);
                  setIsDetailsOpen(true);
                }}
              />
            )}

            <ContentRow 
              title="Lançamentos" 
              items={homeData.newReleases} 
              type="movie" 
              primaryColor={primaryColor}
              onPlay={(item: any) => {
                setSelectedItem(item);
                setIsDetailsOpen(true);
              }}
            />

            <ContentRow 
              title="Mais Assistidos" 
              items={homeData.newReleases.slice().reverse().slice(0, 10)} 
              type="movie" 
              primaryColor={primaryColor}
              onPlay={(item: any) => {
                setSelectedItem(item);
                setIsDetailsOpen(true);
              }}
            />

            <ContentRow 
              title="Canais em Destaque" 
              items={homeData.liveHighlights} 
              type="live" 
              primaryColor={primaryColor}
              onPlay={(item: any) => handlePlay(item.stream_id, "live", item)}
            />

            <AppDownloadCard primaryColor={primaryColor} apkUrl={(settings as any)?.apk_url ?? null} />

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
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <SettingsIcon className="h-5 w-5 text-primary" style={{ color: primaryColor }} />
                      <div>
                        <p className="text-sm font-medium text-white/90">Modo Diagnóstico</p>
                        <p className="text-xs text-white/40">{showDebugHud ? 'Ativado' : 'Desativado'}</p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowDebugHud(!showDebugHud)}
                      className={cn(
                        "h-8 border-white/10",
                        showDebugHud ? "bg-primary/20 text-primary border-primary/20" : "bg-white/5 text-white/60"
                      )}
                    >
                      {showDebugHud ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-3">
                <h2 className="text-lg font-semibold">Plano de Teste e Otimização</h2>
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <h4 className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Diagnóstico Xtream & Web Player
                  </h4>
                  <p className="text-[10px] text-emerald-200/70 leading-relaxed whitespace-pre-wrap">
                    {"# Ajuste do Web Player — usar Core como camada principal de reprodução\n\nPelo diagnóstico, catálogo e login estão funcionando.\n\nAgora quero ajustar a arquitetura de reprodução.\n\nHoje está:\n\nCliente → Painel → IPTV\n\nQuero evoluir para:\n\nCliente → Stream Monitor Core → IPTV\n\nO Core deve ser a camada responsável pela entrega dos streams quando necessário.\n\n## Objetivos:\n\n### 1. Live TV\n\nGarantir reprodução de:\n\n* m3u8;\n* HLS;\n* TS.\n\nO Core deve tratar:\n\n* headers;\n* CORS;\n* conexão;\n* timeout;\n* resposta do stream.\n\n---\n\n### 2. Filmes e Séries\n\nPara:\n\n* MP4;\n* formatos compatíveis com navegador.\n\nUsar o relay/proxy do Core.\n\nPara:\n\n* MKV;\n* AVI;\n* formatos não suportados pelo navegador.\n\nNão tentar apenas entregar direto ao navegador.\n\nCriar uma identificação clara:\n\n\"Formato não compatível com reprodução direta no navegador.\"\n\nRegistrar isso no diagnóstico.\n\n---\n\n### 3. Fluxo inteligente\n\nManter uma lógica:\n\nPrimeiro:\n\nCore Stream Monitor → IPTV\n\nSe o Core identificar que não consegue entregar:\n\nRegistrar o motivo.\n\nNão fazer várias tentativas demoradas.\n\n---\n\n### 4. Diagnóstico no Player\n\nQuando falhar, retornar motivo real:\n\nExemplo:\n\n\"Servidor respondeu normalmente, porém o formato do vídeo não é compatível com navegador.\"\n\nou\n\n\"Servidor bloqueou acesso direto. Reprodução direcionada pelo Core.\"\n\n---\n\n### 5. Não mexer no login\n\nO login Xtream já está funcionando.\n\nFocar somente na camada:\n\nCATÁLOGO → STREAM → PLAYER\n\n---\n\nDepois executar teste real:\n\n✅ Live funcionando\n✅ Filme MP4 funcionando\n✅ Série funcionando\n✅ Erros de MKV/AVI identificados corretamente"}
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
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  disabled={diagLoading}
                  onClick={async () => {
                    if (!token) return;
                    setDiagLoading(true);
                    setDiag(null);
                    try {
                      const { diagnosePlayerPlayback } = await import("@/lib/player.functions");
                      const r = await diagnosePlayerPlayback({ data: { token } });
                      console.log("[PLAYBACK_DEBUG] relatório de reprodução:", r);
                      setDiag(r);
                    } catch (e: any) {
                      console.error("[PLAYBACK_DEBUG] falha", e);
                      setDiag({ erro: e?.message, stack: e?.stack });
                    } finally {
                      setDiagLoading(false);
                    }
                  }}
                >
                  {diagLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Testar reprodução real (Live / Filme / Série)
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h1 className="text-3xl font-black capitalize tracking-tight">
                {activeView === "live" ? "TV Ao Vivo" : activeView === "movie" ? "Filmes" : "Séries"}
              </h1>
              
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <Input 
                  placeholder="Busca rápida..." 
                  className="bg-white/5 border-white/10 pl-9 h-10 rounded-xl text-sm"
                  onChange={(e) => {
                    const q = e.target.value.toLowerCase();
                    // Implementação de busca rápida local (apenas no que já está carregado)
                    // Para busca global, usa-se a aba Buscar
                  }}
                />
              </div>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
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
                      setSelectedItem(i);
                      setIsDetailsOpen(true);
                      if (activeView === "live") {
                        // handlePlay(i.stream_id, "live");
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
                  className="bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-xl"
                  onClick={async () => {
                    const actionMap = { live: "get_live_streams", movie: "get_vod_streams", series: "get_series" } as const;
                    const action = actionMap[activeView as keyof typeof actionMap];
                    const moreData = await getPlayerCatalog({ 
                      data: { 
                        token: token!, 
                        action, 
                        categoryId: selectedCategory || undefined,
                        offset: content.length,
                        limit: 50
                      } 
                    });
                    if (Array.isArray(moreData)) {
                      setContent(prev => [...prev, ...moreData]);
                    }
                  }}
                >
                  Carregar mais conteúdos
                </Button>
              </div>
            )}
          </div>
        )}

      </main>

      {selectedItem && (
        <ContentDetailsOverlay 
          item={selectedItem}
          type={activeView === "live" ? "movie" : (selectedItem.series_id || selectedItem.content_type === "series" || activeView === "series") ? "series" : "movie"}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
          }}
          onPlay={(i: any) => {
            const isSeries = i.series_id || i.content_type === "series" || activeView === "series" || selectedItem.series_id;
            setIsDetailsOpen(false);
            if (activeView === "live") {
              handlePlay(i.stream_id || i.id || i.content_id, "live", i);
            } else if (isSeries) {
              handleOpenSeries(i);
            } else {
              handlePlay(i.stream_id || i.id || i.content_id, "movie", i);
            }
          }}
          primaryColor={primaryColor}
          isFavorite={favorites.some(f => f.content_id === (selectedItem.stream_id || selectedItem.series_id || selectedItem.id || selectedItem.content_id)?.toString())}
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
            handlePlay(item.stream_id || item.id, "live", item);
          } else {
            setSelectedItem(item);
            setIsDetailsOpen(true);
            setIsSearchOpen(false);
          }
        }}

      />

      
      {isSeriesOpen && selectedSeriesInfo && (
        <SeriesDetails 
          series={selectedSeriesInfo.info}
          info={selectedSeriesInfo}
          loading={loadingSeries}
          
          onClose={() => {
            setSelectedSeriesInfo(null);
            setIsSeriesOpen(false);
          }}
          onPlay={(ep) => handlePlay(ep.id ?? ep.stream_id, "series", ep)}
          primaryColor={primaryColor}
        />
      )}

      {/* Video Player */}
      {isPlaying && (
        <div className="fixed inset-0 z-[100] bg-black">
          {/* Diagnostic HUD (Admin Only) */}
          {isAdmin && (
            <div className="absolute top-20 left-6 z-[120] max-w-sm pointer-events-none">
              <div className="bg-black/80 backdrop-blur-md p-4 rounded-2xl border border-blue-500/20 text-[10px] font-mono text-blue-400 space-y-2 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                  <span className="font-black uppercase tracking-widest text-white/90">Diagnostic Mode</span>
                  <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[8px] text-blue-300">ADMIN</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Status HTTP:</span> <span className={playbackDebug?.status === 206 || playbackDebug?.status === 200 ? "text-emerald-400" : "text-amber-400"}>{playbackDebug?.status || "WAIT"}</span></div>
                  <div className="flex justify-between"><span>Range:</span> <span>{playbackDebug?.contentRange || playbackDebug?.acceptRanges || "NONE"}</span></div>
                  <div className="flex justify-between"><span>TTFB:</span> <span>{playbackDebug?.ms}ms</span></div>
                  <div className="flex justify-between"><span>Via:</span> <span className="text-primary">{playbackDebug?.via || "RELAY"}</span></div>
                  <div className="flex justify-between"><span>Core:</span> <span className="text-white/40">{CORE_STREAM_VERSION}</span></div>
                  {playbackDebug?.reason && <div className="text-red-400 mt-2 bg-red-500/10 p-2 rounded border border-red-500/20 whitespace-pre-wrap">{playbackDebug.reason}</div>}
                </div>
                <div className="pt-2 mt-2 border-t border-white/10 flex gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); runCompatTest(); }}
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 py-1.5 rounded-lg transition-colors pointer-events-auto text-[9px] uppercase tracking-tighter"
                  >
                    Compatibility Test
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="absolute top-6 left-6 z-10">
             <Button 
               variant="ghost" 
               onClick={handleClosePlayer} 
               className="bg-black/40 hover:bg-white/10 text-white rounded-full h-12 w-12 p-0 transition-all border border-white/5"
             >
               <X className="h-6 w-6" />
             </Button>
          </div>
          
          <div className="h-full w-full flex items-center justify-center">
             {playbackReason ? (
                <div className="max-w-md mx-6 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-xl p-10 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in duration-300">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                     {playbackReason.includes("Conectando") ? (
                       <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                     ) : playbackReason.includes("indisponível") ? (
                       <AlertCircle className="h-8 w-8 text-red-500" />
                     ) : (
                       <PlayCircle className="h-8 w-8 text-white/40" />
                     )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-lg font-bold text-white tracking-tight">
                      {playbackReason.includes("indisponível") || playbackReason.includes("indisponível")
                        ? "Conteúdo indisponível"
                        : playbackReason.includes("lento") || playbackReason.includes("instável")
                        ? "O servidor está instável"
                        : playbackReason.includes("Conectando")
                        ? "Carregando conteúdo..."
                        : "Falha na reprodução"}
                    </p>
                    <p className="text-sm text-white/40 font-medium">
                      {playbackReason.includes("Conectando") 
                        ? "Isso pode levar alguns segundos dependendo da sua conexão."
                        : "Tente novamente em instantes ou selecione outro conteúdo."}
                    </p>
                  </div>
                  
                  {!playbackReason.includes("Conectando") && (
                    <Button 
                      variant="outline" 
                      onClick={() => setIsPlaying(false)}
                      className="border-white/10 text-white/60 hover:text-white hover:bg-white/5 w-full rounded-xl py-6"
                    >
                      Voltar ao catálogo
                    </Button>
                  )}
                </div>
             ) : !streamUrl ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="text-white/50 text-xs font-black uppercase tracking-[0.3em] transition-opacity">
                    {SMART_LOADING_MESSAGES[smartMsgIndex]}
                  </p>
                </div>

             ) : (
                  <video 
                    ref={videoRef}
                    className="w-full h-full max-h-screen object-contain"
                    controls
                    autoPlay
                    playsInline
                    preload="auto"
                    crossOrigin="anonymous"
                  />
             )}
          </div>

          {isAdmin && showDebugHud && playbackDebug && (
            <div className="absolute bottom-24 left-6 z-20 max-w-[90vw] rounded-xl border border-white/10 bg-black/70 px-4 py-3 font-mono text-[11px] leading-relaxed text-emerald-300 backdrop-blur">
              <div className="mb-1 text-white/70">Diagnóstico de Reprodução (Admin)</div>
              <div className="mb-2 flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] text-emerald-400">FE: {feVersion}</span>
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-[9px] text-blue-400">CORE: {CORE_STREAM_VERSION}</span>
              </div>
              <div>tipo: {playbackDebug.tipo ?? "-"} · ext: {playbackDebug.extensao ?? "-"}</div>
              <div>via: {playbackDebug.via ?? "aguardando..."}</div>
              <div>status: {playbackDebug.status ?? "-"} · tempo: {playbackDebug.ms != null ? `${(Number(playbackDebug.ms || 0) / 1000).toFixed(1)}s` : "-"}</div>
              <div>upstream: {playbackDebug.upstream ?? "-"} {playbackDebug.upstream_ct ? `(${playbackDebug.upstream_ct})` : ""}</div>
              <div>codec: {playbackDebug.codec_video ?? "-"} / {playbackDebug.codec_audio ?? "-"} {playbackDebug.acao && playbackDebug.acao !== "direct" ? `· ${playbackDebug.acao}` : ""}</div>
              <div>formato: {playbackDebug.contentType ?? "-"}</div>
              <div>range: {playbackDebug.contentRange ?? playbackDebug.acceptRanges ?? "-"}</div>
              {playbackDebug.amostra && <div className="text-white/50">bytes: {String(playbackDebug.amostra).slice(0, 60)}</div>}
              <div>worker: {playbackDebug.worker ?? "-"} · core_status: {playbackDebug.core_status ?? "-"}</div>
              {playbackDebug.core_erro && <div className="text-amber-400">core_erro: {playbackDebug.core_erro}</div>}
              {playbackDebug.reason && <div className="text-red-400">motivo: {playbackDebug.reason}</div>}
              {playbackDebug.erro_hls && <div className="text-red-400">erro_hls: {playbackDebug.erro_hls}</div>}
              {playbackDebug.erro_video && <div className="text-red-400">erro_video: {playbackDebug.erro_video}</div>}
              {compat && (
                <div className={compat.ok ? "text-emerald-300" : "text-amber-400"}>compat: {compat.label}</div>
              )}
              {compat?.transport && (
                <div className="text-white/60">
                  <div>ct: {compat.transport.contentType ?? "-"} · accept-ranges: {compat.transport.acceptRanges ?? "-"}</div>
                  <div>length: {compat.transport.contentLength ?? "-"} · {compat.transport.contentRange ?? "-"}</div>
                  <div>{compat.transport.firstRange} · {compat.transport.midRange}</div>
                  {compat.transport.notes.map((n) => (
                    <div key={n} className="text-amber-400">! {n}</div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={compatLoading}
                onClick={() => void runCompatTest()}
                className="mt-1 rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {compatLoading ? "analisando..." : "Testar compatibilidade Web"}
              </button>
            </div>
          )}
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

  function handlePlay(id: string, type: "live" | "movie" | "series", item?: any) {
    if (id === undefined || id === null || String(id).trim() === "") {
      const error = type === "series" ? "O episódio não possui episode_id válido." : "O conteúdo não possui stream_id válido.";
      console.error("[PLAY]", { tipo: type, conteudo: item?.name ?? item?.title ?? null, stream_id: null, episode_id: null, url_gerada: null, via: null, status: "erro", erro: error });
      toast.error(error);
      return;
    }

    // Live → HLS (.m3u8) é o formato reproduzível no navegador.
    // Filmes/Séries → extensão real do container (.mp4, .mkv, .ts) com Range.
    const extension = type === "live" ? "m3u8" : (item?.container_extension || "mp4");

    // Fluxo inteligente: formato incompatível não gera tentativas demoradas.
    if (type !== "live" && !isBrowserPlayable(extension)) {
      const reason = `${NEEDS_CONVERSION_MESSAGE} — ${incompatibleReason(extension)}`;
      console.warn("[PLAYER_DEBUG] formato incompatível", { tipo: type, content_id: id, extensao: extension, motivo: reason });
      setStreamUrl(null);
      setCompat({
        ok: false,
        container: extension,
        video: null,
        audio: null,
        action: "remux",
        via: null,
        status: null,
        label: `⚠️ container .${extension} precisa conversão`,
        detail: NEEDS_CONVERSION_MESSAGE,
      });
      setPlaybackReason(reason);
      setIsPlaying(true);
      toast.error(reason, { duration: 8000 });
      return;
    }

    setIsPlaying(true);
    setSelectedItem(item ?? selectedItem);
    setStreamUrl(null);
    setCompat(null);
    setPlaybackReason("Conectando ao servidor...");
    
    const started = Date.now();
    setPlaybackDebug({ 
      tipo: type, 
      extensao: extension, 
      contentId: id, 
      status: null, 
      via: "aguardando...", 
      started_at: started 
    });

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeoutId = setTimeout(() => {
      if (!streamUrl && isPlaying) {
        setPlaybackReason("Servidor instável, tentando novamente...");
        // Tentativa de reconexão automática ou fallback
      }
    }, 15000);

    // Inicia busca da URL sem bloquear a abertura do player
    getPlayerStreamUrl({
      data: {
        token: token!,
        streamId: id.toString(),
        type,
        extension,
      }
    }).then(async (url) => {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) return;

      if (!url) {
        setPlaybackReason("Não foi possível iniciar este conteúdo. Tente novamente.");
        return;
      }

      // Probe de diagnóstico opcional (para HUD se for Admin)
      const t0 = Date.now();
      try {
        const checkUrl = `${url}${url.includes("?") ? "&" : "?"}probe=1&forceCore=1`;
        const res = await fetch(checkUrl, { signal: AbortSignal.timeout(60000) });
        const reason = res.headers.get("x-playback-reason");
        const info = {
          url,
          via: res.headers.get("x-playback-via") || "PAINEL",
          status: res.status,
          time: Date.now() - t0,
          ms: Date.now() - t0,
          reason,
          upstream: res.headers.get("x-upstream-status"),
          contentLength: res.headers.get("content-length"),
          contentRange: res.headers.get("content-range"),
          acceptRanges: res.headers.get("accept-ranges"),
        };
        
        setPlaybackDebug((prev: any) => ({ ...(prev ?? {}), ...info }));
        
        if (res.status === 415) {
          setPlaybackReason("Formato de vídeo incompatível com o navegador.");
          setStreamUrl(null);
        } else if (!res.ok && res.status !== 206) {
          setPlaybackReason("Não foi possível iniciar este conteúdo. Tente novamente.");
          setStreamUrl(null);
        } else {
          setPlaybackReason(null);
          setStreamUrl(`${url}${url.includes("?") ? "&" : "?"}forceCore=1`);
        }
      } catch (e) {
        // Se o probe falhar mas o player puder tentar direto, tentamos
        console.warn("[PLAY] probe falhou, tentando tocar assim mesmo");
        setPlaybackReason(null);
        setStreamUrl(`${url}${url.includes("?") ? "&" : "?"}forceCore=1`);
      }
    }).catch(err => {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) return;
      console.error("[PLAY_ERROR]", err);
      setPlaybackReason("Não foi possível iniciar este conteúdo. Tente novamente.");
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
      endpoint: "getPlayerCatalog(action=get_series_info)",
    });
    
    setSelectedSeriesInfo({ info: item, episodes: {} });
    setLoadingSeries(true);
    setIsDetailsOpen(false);
    
    try {
      const data = await getPlayerCatalog({ 
        data: { 
          token: token!, 
          action: "get_series_info", 
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
        throw new Error("O servidor IPTV demorou muito ou retornou dados inválidos.");
      }

      setSelectedSeriesInfo(data);
      setIsSeriesOpen(true);
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
    setPlaybackReason(null);
    setPlaybackDebug(null);
    setCompat(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }



}


function LoginForm({ resellerId, settings, onLogin, primaryColor, secondaryColor }: any) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverId, setServerId] = useState("");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUsername(localStorage.getItem(`stream_player_last_user_${resellerId}`) || "");
      setServerId(localStorage.getItem(`stream_player_last_server_${resellerId}`) || "");
    }
  }, [resellerId]);
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
    if (typeof window !== "undefined") {
      localStorage.setItem(`stream_player_last_server_${resellerId}`, serverId);
      localStorage.setItem(`stream_player_last_user_${resellerId}`, username);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundColor: secondaryColor }}>
      <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ backgroundColor: primaryColor }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-black/60 backdrop-blur-3xl border border-white/5 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="flex flex-col items-center mb-8">
            <div className="h-20 w-20 bg-white/5 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/10 mb-4 shadow-xl ring-1 ring-white/5 transition-transform hover:scale-105 duration-500">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="max-h-14 max-w-14 object-contain filter drop-shadow-2xl" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-transparent">
                  <PlayCircle className="h-10 w-10" style={{ color: primaryColor }} />
                </div>
              )}
            </div>
            <h1 className="text-3xl font-black text-white tracking-tighter uppercase drop-shadow-sm">{settings?.brand_name || "Stream Player"}</h1>
            <p className="text-white/40 text-sm mt-2 font-medium tracking-wide">
              {settings?.welcome_message || "Acesse seu portal de entretenimento"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Servidor</Label>
              <div className="relative group/field">
                <select 
                  className="w-full bg-black border border-white/5 focus:border-primary/50 rounded-xl px-4 py-3.5 text-white outline-none appearance-none transition-all hover:bg-neutral-900 pr-10"
                  value={serverId}
                  onChange={(e) => setServerId(e.target.value)}
                  disabled={loginMutation.isPending}
                >
                  <option value="">Selecione o servidor...</option>
                  {servers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name || s.host}</option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                  <ChevronRight className="h-4 w-4 rotate-90" />
                </div>
                {healthInfo && (
                  <div className="absolute -right-2 -top-2 scale-90">
                    <DiagnosticBadge 
                      status={healthInfo.status} 
                      healthScore={healthInfo.healthScore}
                      latency={healthInfo.latency}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Usuário</Label>
              <Input
                placeholder="Insira seu usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-black border-white/5 focus:border-primary/50 h-12 rounded-xl text-white placeholder:text-white/10"
                disabled={loginMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Senha</Label>
              <Input
                type="password"
                placeholder="Insira sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-black border-white/5 focus:border-primary/50 h-12 rounded-xl text-white placeholder:text-white/10"
                disabled={loginMutation.isPending}
              />
            </div>

            <Button 
              type="submit"
              className="w-full h-14 rounded-xl font-black uppercase tracking-widest text-xs transition-all active:scale-[0.98] shadow-2xl overflow-hidden group/btn relative"
              style={{ backgroundColor: primaryColor, color: '#fff' }}
              disabled={loginMutation.isPending}
            >
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300" />
              <div className="relative flex items-center justify-center gap-2">
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  <>
                    Entrar no Player
                    <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
              </div>
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-medium tracking-widest text-white/20 uppercase">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3 w-3 text-emerald-500/50" />
              Proteção HMAC v2
            </div>
            <div>Core v{CORE_STREAM_VERSION.split('-')[0]}</div>
          </div>
        </div>
        
        <p className="text-center mt-6 text-[10px] text-white/20 uppercase tracking-[0.2em] font-black">
          Powered by Stream Monitor Cloud
        </p>
      </div>
    </div>
  );
}
