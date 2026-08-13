import { Play, Plus, Info, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroBannerProps {
  item: any;
  onPlay: (item: any) => void;
  onMyList?: (item: any) => void;
  primaryColor?: string;
}

export function HeroBanner({ item, onPlay, onMyList, primaryColor }: HeroBannerProps) {
  if (!item) return null;

  const title = item.name || item.title;
  const description = item.plot || item.description || "Assista agora a este conteúdo incrível disponível na plataforma.";
  const background = item.backdrop || item.cover || item.stream_icon || item.series_icon;
  const rating = item.rating || item.rating_5point;
  const year = item.year || (item.releaseDate ? new Date(item.releaseDate).getFullYear() : null);

  return (
    <div className="relative w-full h-[70vh] min-h-[500px] overflow-hidden rounded-3xl mb-8 group">
      {/* Background Image with Gradient */}
      <div className="absolute inset-0">
        <img 
          src={background} 
          alt={title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 p-8 md:p-16 w-full md:w-2/3 space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm font-medium">
            <span className="px-2 py-0.5 rounded bg-primary text-white" style={{ backgroundColor: primaryColor }}>
              DESTAQUE
            </span>
            {rating && (
              <span className="flex items-center gap-1 text-yellow-500">
                <Star className="h-4 w-4 fill-yellow-500" />
                {rating}
              </span>
            )}
            {year && <span className="text-white/60">{year}</span>}
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight drop-shadow-2xl">
            {title}
          </h1>
          
          <p className="text-lg text-white/80 line-clamp-3 max-w-xl leading-relaxed">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Button 
            size="lg" 
            className="h-14 px-8 text-lg font-bold rounded-xl shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
            style={{ backgroundColor: primaryColor }}
            onClick={() => onPlay(item)}
          >
            <Play className="mr-2 h-6 w-6 fill-white" /> Assistir Agora
          </Button>
          
          <Button 
            size="lg" 
            variant="outline"
            className="h-14 px-8 text-lg font-bold rounded-xl bg-white/5 border-white/10 hover:bg-white/10 transition-all text-white"
            onClick={() => onMyList?.(item)}
          >
            <Plus className="mr-2 h-6 w-6" /> Minha Lista
          </Button>

          <Button 
            size="icon"
            variant="ghost"
            className="h-14 w-14 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white"
          >
            <Info className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
