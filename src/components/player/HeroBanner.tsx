import { Play, Plus, Info, Star, Check, ChevronLeft, ChevronRight, Film, Clock, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { TrailerModal } from "@/components/player/TrailerModal";

interface HeroBannerProps {
  items?: any[]; // Array para rotação
  item: any; // Fallback para item único
  onPlay: (item: any) => void;
  onMyList?: (item: any) => void;
  onDetails?: (item: any) => void;
  primaryColor?: string;
  isFavorite?: (item: any) => boolean;
}

export function HeroBanner({ items = [], item: fallbackItem, onPlay, onMyList, onDetails, primaryColor, isFavorite }: HeroBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const rotationItems = items.length > 0 ? items : (fallbackItem ? [fallbackItem] : []);
  const item = rotationItems[currentIndex];

  useEffect(() => {
    if (rotationItems.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % rotationItems.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [rotationItems.length]);

  if (!item) return null;

  const title = item.name || item.title;
  const description = item.plot || item.description || "Assista agora a este conteúdo incrível disponível na plataforma.";
  const background = item.backdrop || item.cover || item.stream_icon || item.series_icon;
  const rating = Number(item.rating || item.rating_5point || 0);
  const year = item.year || (item.releaseDate ? new Date(item.releaseDate).getFullYear() : null);
  const genre = item.genre || item.category_name;
  const duration = item.duration || item.episode_run_time;
  const seasons = item.seasons?.length || item.season_count;
  const episodes = item.episode_count;
  const isSeriesItem = !!(item.series_id || item.content_type === "series" || seasons);


  return (
    <div className="relative w-full h-[70vh] md:h-[75vh] min-h-[500px] md:min-h-[600px] aspect-[9/16] md:aspect-auto overflow-hidden rounded-3xl mb-8 group transition-all duration-500">

      {/* Background Image with Gradient */}
      <div className="absolute inset-0 transition-opacity duration-1000">
        <img 
          key={item.stream_id || item.series_id || item.id}
          src={background} 
          alt={title}
          className="w-full h-full object-cover transition-transform duration-10000"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-transparent to-transparent" />
      </div>

      {/* Navigation Arrows */}
      {rotationItems.length > 1 && (
        <>
          <button 
            onClick={() => setCurrentIndex(prev => (prev - 1 + rotationItems.length) % rotationItems.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/40 text-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button 
            onClick={() => setCurrentIndex(prev => (prev + 1) % rotationItems.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/40 text-white"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          
          {/* Indicators */}
          <div className="absolute bottom-8 right-8 z-20 flex gap-2">
            {rotationItems.map((_, i) => (
              <div 
                key={i}
                className={cn(
                  "h-1.5 transition-all duration-300 rounded-full",
                  i === currentIndex ? "w-8 bg-primary" : "w-2 bg-white/20"
                )}
                style={i === currentIndex ? { backgroundColor: primaryColor } : {}}
              />
            ))}
          </div>
        </>
      )}

      {/* Content */}
      <div className="absolute bottom-0 left-0 p-6 md:p-16 w-full md:w-2/3 space-y-4 md:space-y-6">

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm font-medium">
            <span className="px-2 py-0.5 rounded text-white text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: primaryColor }}>
              Em Destaque
            </span>
            {rating > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <Star className="h-4 w-4 fill-yellow-500" />
                {rating.toFixed(1)}
              </span>
            )}
            {year && <span className="text-white/60">{year}</span>}
            {genre && <span className="text-white/40 truncate max-w-[10rem]">{genre}</span>}
            {duration && (
              <span className="flex items-center gap-1 text-white/40">
                <Clock className="h-3.5 w-3.5" /> {duration}
              </span>
            )}
            {seasons && (
              <span className="flex items-center gap-1 text-white/40">
                <Layers className="h-3.5 w-3.5" /> {seasons} temporada{Number(seasons) > 1 ? "s" : ""}
                {episodes ? ` · ${episodes} ep.` : ""}
              </span>
            )}
          </div>
          
          <h1 className="text-3xl md:text-6xl font-bold text-white tracking-tight drop-shadow-2xl line-clamp-2 md:line-clamp-none">
            {title}
          </h1>

          
          <p className="text-sm md:text-lg text-white/80 line-clamp-2 md:line-clamp-3 max-w-xl leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:gap-4 pt-2">
          <Button 
            size="lg" 
            className="flex-1 md:flex-none h-12 md:h-14 px-6 md:px-10 text-base md:text-lg font-bold rounded-xl shadow-xl transition-all active:scale-95"
            style={{ backgroundColor: primaryColor }}
            onClick={() => onPlay(item)}
          >
            <Play className="mr-2 h-5 w-5 md:h-6 md:w-6 fill-white" /> Assistir agora
          </Button>

          {onDetails && (
            <Button
              size="lg"
              variant="outline"
              className="h-12 md:h-14 px-5 md:px-8 text-base font-bold rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white active:scale-95"
              onClick={() => onDetails(item)}
            >
              <Info className="h-5 w-5 md:mr-2" />
              <span className="hidden md:inline">Ver detalhes</span>
            </Button>
          )}

          <Button
            size="lg"
            variant="outline"
            className="h-12 md:h-14 px-5 md:px-8 text-base font-bold rounded-xl bg-white/5 border-white/10 hover:bg-white/10 text-white active:scale-95"
            onClick={() => setTrailerOpen(true)}
          >
            <Film className="h-5 w-5 md:mr-2" />
            <span className="hidden md:inline">Trailer</span>
          </Button>
          
          <Button 
            size="lg" 
            variant="outline"
            className="h-12 md:h-14 w-12 md:w-auto px-0 md:px-8 text-lg font-bold rounded-xl bg-white/5 border-white/10 hover:bg-white/10 transition-all text-white active:scale-95"
            onClick={() => onMyList?.(item)}
          >
            {isFavorite?.(item) ? <Check className="h-5 w-5 md:h-6 md:w-6 text-green-500" /> : <Plus className="h-5 w-5 md:h-6 md:w-6" />}
            <span className="hidden md:inline ml-2">{isFavorite?.(item) ? "Na Minha Lista" : "Minha Lista"}</span>
          </Button>
        </div>

      </div>

      <TrailerModal
        isOpen={trailerOpen}
        onClose={() => setTrailerOpen(false)}
        title={title}
        type={isSeriesItem ? "series" : "movie"}
      />
    </div>
  );
}

