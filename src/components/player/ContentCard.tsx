import { Play, Star, Plus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ContentCardProps {
  item: any;
  type: "live" | "movie" | "series";
  primaryColor?: string;
  onClick: (item: any) => void;
  onInfoClick?: (item: any) => void;
}

export function ContentCard({ item, type, primaryColor, onClick, onInfoClick }: ContentCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const title = item.name || item.title;
  const image = item.stream_icon || item.cover || item.series_icon;
  const rating = item.rating || item.rating_5point;
  const year = item.year || (item.releaseDate ? new Date(item.releaseDate).getFullYear() : null);
  
  // Aspect ratio: VOD/Series usually 2:3, Live usually 16:9 or square
  const isLive = type === "live";

  return (
    <div 
      className="group relative flex flex-col gap-2 transition-transform duration-300 hover:z-10"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className={cn(
          "relative overflow-hidden rounded-xl bg-neutral-900 shadow-lg cursor-pointer transition-all duration-300",
          isHovered ? "ring-2 scale-105" : "scale-100"
        )}
        style={isHovered ? { borderColor: primaryColor, boxShadow: `0 0 0 2px ${primaryColor}` } : {}}
        onClick={() => onClick(item)}

      >
        <div className={cn(
          "w-full bg-neutral-800",
          isLive ? "aspect-video" : "aspect-[2/3]"
        )}>
          {image ? (
            <img 
              src={image} 
              alt={title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <Play className="h-10 w-10 opacity-20" />
            </div>
          )}
        </div>

        {/* Overlay on hover */}
        <div className={cn(
          "absolute inset-0 bg-black/60 flex items-center justify-center gap-2 transition-opacity duration-300",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          <div 
            className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white shadow-xl transform transition-transform duration-300 scale-90 hover:scale-110"
            style={{ backgroundColor: primaryColor }}
          >
            <Play className="h-6 w-6 fill-white ml-1" />
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {isLive && (
            <span className="px-2 py-0.5 rounded bg-red-600 text-[10px] font-bold uppercase tracking-wider text-white">
              AO VIVO
            </span>
          )}
          {item.stream_type === "movie" && item.container_extension === "mp4" && (
            <span className="px-2 py-0.5 rounded bg-blue-600/80 text-[10px] font-bold uppercase tracking-wider text-white">
              HD
            </span>
          )}
        </div>
      </div>

      <div className="px-1 py-1">
        <h3 className={cn(
          "text-sm font-semibold truncate transition-colors",
          isHovered ? "text-primary" : "text-white/90"
        )} style={isHovered ? { color: primaryColor } : {}}>
          {title}
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-white/40 mt-0.5 font-medium">
          {rating && rating > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-500">
              <Star className="h-3 w-3 fill-yellow-500" />
              {rating}
            </span>
          )}
          {year && <span>{year}</span>}
          {type === "movie" && <span>Filme</span>}
          {type === "series" && <span>Série</span>}
        </div>
      </div>
    </div>
  );
}
