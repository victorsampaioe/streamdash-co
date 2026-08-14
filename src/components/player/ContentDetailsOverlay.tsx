import { X, Play, Plus, Star, Clock, Calendar, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getTMDBMetadata } from "@/lib/player.functions";

interface ContentDetailsOverlayProps {
  item: any;
  type: "movie" | "series";
  isOpen: boolean;
  onClose: () => void;
  onPlay: (item: any) => void;
  primaryColor: string;
}

export function ContentDetailsOverlay({ 
  item, 
  type, 
  isOpen, 
  onClose, 
  onPlay,
  primaryColor 
}: ContentDetailsOverlayProps) {
  const { data: metadata, isLoading } = useQuery({
    queryKey: ["tmdb-metadata", item?.name || item?.title, type],
    queryFn: async () => {
      // Limpar título para melhor busca (remover resoluções e tags comuns)
      const cleanTitle = (item?.name || item?.title || "")
        .replace(/\b(4K|FHD|HD|SD|720p|1080p|2160p)\b/gi, "")
        .replace(/\[.*?\]|\(.*?\)/g, "")
        .trim();

      return await getTMDBMetadata({ 
        data: { 
          title: cleanTitle, 
          type: type === "movie" ? "movie" : "tv" 
        } 
      });
    },
    enabled: isOpen && !!(item?.name || item?.title),
    staleTime: 1000 * 60 * 60 * 24, // 24h
  });

  if (!isOpen) return null;

  const displayTitle = metadata?.title || item?.name || item?.title;
  const overview = metadata?.overview || item?.plot || "Sem descrição disponível.";
  const rating = metadata?.vote_average || item?.rating;
  const backdrop = metadata?.backdrop_path 
    ? `https://image.tmdb.org/t/p/original${metadata.backdrop_path}` 
    : (item?.stream_icon || item?.cover);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-300">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-5xl bg-[#0a0a0a] rounded-2xl overflow-hidden border border-white/10 shadow-2xl animate-in zoom-in-95 duration-300">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/80 rounded-full text-white/70 hover:text-white transition-all"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="flex flex-col md:flex-row h-full max-h-[90vh] overflow-y-auto scrollbar-hide">
          {/* Backdrop / Poster Section */}
          <div className="relative w-full md:w-[45%] aspect-video md:aspect-[2/3]">
            <img 
              src={backdrop} 
              alt={displayTitle}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#0a0a0a] hidden md:block" />
          </div>

          {/* Details Section */}
          <div className="flex-1 p-6 md:p-10 flex flex-col justify-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
                {displayTitle}
              </h2>
              
              <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-white/60">
                {rating > 0 && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="text-white font-bold">{rating.toFixed(1)}</span>
                  </div>
                )}
                {metadata?.release_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(metadata.release_date).getFullYear()}</span>
                  </div>
                )}
                {metadata?.runtime && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{metadata.runtime} min</span>
                  </div>
                )}
                {type === "series" && (
                  <span className="px-2 py-0.5 bg-white/10 rounded text-xs font-black uppercase tracking-wider">Série</span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-lg text-white/70 leading-relaxed line-clamp-6">
                {overview}
              </p>

              {metadata?.genres && metadata.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {metadata.genres.map((genre: string) => (
                    <span key={genre} className="px-3 py-1 bg-white/5 rounded-full text-xs font-semibold border border-white/10">
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                onClick={() => onPlay(item)}
                className="h-14 px-8 rounded-xl font-black text-lg gap-2 shadow-xl transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: primaryColor }}
              >
                <Play className="h-6 w-6 fill-current" />
                Assistir Agora
              </Button>
              
              <Button 
                variant="outline"
                className="h-14 px-8 rounded-xl font-black text-lg gap-2 bg-white/5 border-white/10 hover:bg-white/10 transition-all"
              >
                <Plus className="h-6 w-6" />
                Minha Lista
              </Button>
            </div>

            {metadata?.cast && metadata.cast.length > 0 && (
              <div className="pt-6 border-t border-white/5">
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Elenco Principal</p>
                <p className="text-sm text-white/60">
                  {metadata.cast.join(", ")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
