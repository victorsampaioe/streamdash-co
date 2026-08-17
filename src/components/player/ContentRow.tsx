import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRef } from "react";
import { ContentCard } from "./ContentCard";
import { cn } from "@/lib/utils";

interface ContentRowProps {
  title: string;
  items: any[];
  type: "live" | "movie" | "series";
  primaryColor?: string;
  onPlay: (item: any) => void;
  onInfo?: (item: any) => void;
  onToggleFavorite?: (item: any) => void;
  onTrailer?: (item: any) => void;
  isFavorite?: (item: any) => boolean;
  enablePreview?: boolean;
}

export function ContentRow({
  title,
  items,
  type,
  primaryColor,
  onPlay,
  onInfo,
  onToggleFavorite,
  onTrailer,
  isFavorite,
  enablePreview = false,
}: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -800 : 800;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-3 py-2 group/row">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-2">
        <h2 className="truncate text-lg md:text-2xl font-bold text-white tracking-tight">{title}</h2>
        <div className="hidden md:flex gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button
            aria-label="Voltar"
            onClick={() => scroll("left")}
            className="h-8 w-8 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            aria-label="Avançar"
            onClick={() => scroll("right")}
            className="h-8 w-8 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 md:gap-4 overflow-x-auto pb-4 px-2 scrollbar-hide no-scrollbar scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {items.map((item) => (
          <div
            key={item.stream_id || item.series_id || item.id}
            className={cn("flex-shrink-0", type === "live" ? "w-56 md:w-64" : "w-32 md:w-48")}
          >
            <ContentCard
              item={item}
              type={type}
              primaryColor={primaryColor}
              onClick={onPlay}
              onInfoClick={onInfo}
              onToggleFavorite={onToggleFavorite}
              onTrailerClick={onTrailer}
              isFavorite={isFavorite?.(item)}
              enablePreview={enablePreview}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
