import { 
  X, 
  Star, 
  Calendar, 
  Play, 
  Plus, 
  ChevronRight,
  ChevronLeft,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SeriesDetailsProps {
  series: any;
  info: any;
  loading: boolean;
  onClose: () => void;
  onPlay: (episode: any) => void;
  primaryColor?: string;
}

export function SeriesDetails({ series, info, loading, onClose, onPlay, primaryColor }: SeriesDetailsProps) {
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  
  // Normalização segura das temporadas
  const seasons = useMemo(() => {
    if (!info?.episodes) return [];
    try {
      return Object.keys(info.episodes)
        .map(Number)
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);
    } catch (e) {
      console.error("[SeriesDetails] Erro ao processar temporadas:", e);
      return [];
    }
  }, [info?.episodes]);
  
  useEffect(() => {
    if (seasons.length > 0 && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  const episodes = useMemo(() => {
    const list = info?.episodes?.[selectedSeason.toString()] || info?.episodes?.[selectedSeason] || [];
    return Array.isArray(list) ? list : [];
  }, [info?.episodes, selectedSeason]);

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950 overflow-y-auto animate-in fade-in zoom-in-95 duration-300">
      {/* Hero Section */}
      <div className="relative w-full h-[60vh] min-h-[400px]">
        <img 
          src={info?.info?.cover || series?.cover || series?.series_icon} 
          className="w-full h-full object-cover"
          alt={series?.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-transparent" />
        
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 h-12 w-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-black/60 transition-colors z-50"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="absolute bottom-0 left-0 p-8 md:p-16 w-full md:w-2/3 space-y-6">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
              {series?.name || info?.info?.name}
            </h1>
            <div className="flex items-center gap-4 text-sm font-medium">
              <span className="flex items-center gap-1 text-yellow-500">
                <Star className="h-4 w-4 fill-yellow-500" />
                {info?.info?.rating || series?.rating}
              </span>
              {info?.info?.releaseDate && <span className="text-white/60">{new Date(info.info.releaseDate).getFullYear()}</span>}
              <span className="text-white/60">{seasons.length} Temporadas</span>
            </div>
            <p className="text-lg text-white/80 line-clamp-3 max-w-2xl">
              {info?.info?.plot || "Nenhuma sinopse disponível."}
            </p>
          </div>

          <div className="flex gap-4">
            <Button 
              size="lg" 
              className="h-14 px-8 text-lg font-bold rounded-xl"
              style={{ backgroundColor: primaryColor }}
              onClick={() => episodes[0] && onPlay(episodes[0])}
            >
              <Play className="mr-2 h-6 w-6 fill-white" /> Assistir S1:E1
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              className="h-14 px-8 text-lg font-bold rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white"
            >
              <Plus className="mr-2 h-6 w-6" /> Minha Lista
            </Button>
          </div>
        </div>
      </div>

      {/* Episodes Section */}
      <div className="container max-w-7xl mx-auto px-6 py-12 pb-24">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-6">
            <h2 className="text-2xl font-bold">Episódios</h2>
            <div className="flex gap-2">
              {seasons.map(season => (
                <button
                  key={season}
                  onClick={() => setSelectedSeason(season)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                    selectedSeason === season 
                      ? "bg-primary text-white" 
                      : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
                  )}
                  style={selectedSeason === season ? { backgroundColor: primaryColor } : {}}
                >
                  Temp. {season}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {episodes.map((episode: any) => (
              <div 
                key={episode.id}
                className="group relative rounded-xl overflow-hidden bg-white/5 border border-white/5 hover:border-white/20 transition-all cursor-pointer"
                onClick={() => onPlay(episode)}
              >
                <div className="aspect-video relative overflow-hidden">
                  <img 
                    src={episode.info?.movie_image || info?.info?.cover} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    alt={episode.title}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-xl" style={{ backgroundColor: primaryColor }}>
                      <Play className="h-6 w-6 fill-white ml-1" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/80 rounded text-[10px] font-bold">
                    {episode.info?.duration || "45 min"}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold truncate pr-2">
                      {episode.title}
                    </h3>
                  </div>
                  <p className="text-xs text-white/40 line-clamp-2">
                    {episode.info?.plot || `Episódio ${episode.episode_num} da temporada ${selectedSeason}.`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
