import { Play, ChevronRight, ChevronLeft } from "lucide-react";
import { useRef } from "react";
import { ContentCard } from "./ContentCard";
import { cn } from "@/lib/utils";

interface ContentRowProps {
  title: string;
  items: any[];
  type: "live" | "vod" | "series";
  primaryColor?: string;
  onPlay: (item: any) => void;
}

export function ContentRow({ title, items, type, primaryColor, onPlay }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -800 : 800;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-4 py-4 group/row">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          {title}
          <ChevronRight className="h-5 w-5 text-white/20 group-hover/row:text-primary transition-colors" />
        </h2>
        <div className="flex gap-2 opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button 
            onClick={() => scroll("left")}
            className="h-8 w-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button 
            onClick={() => scroll("right")}
            className="h-8 w-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-6 px-2 scrollbar-hide no-scrollbar scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => (
          <div 
            key={item.stream_id || item.series_id || item.id} 
            className={cn(
              "flex-shrink-0",
              type === "live" ? "w-64" : "w-40 md:w-48"
            )}
          >
            <ContentCard 
              item={item} 
              type={type} 
              primaryColor={primaryColor} 
              onClick={onPlay} 
            />
          </div>
        ))}
      </div>
    </div>
  );
}
