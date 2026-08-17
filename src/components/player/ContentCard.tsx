import { Play, Star, Plus, Info, Check, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { detectQuality, getRating, getYear } from "@/lib/player-curation";
import { useHoverTrailer } from "@/hooks/useHoverTrailer";

interface ContentCardProps {
  item: any;
  type: "live" | "movie" | "series";
  primaryColor?: string;
  onClick: (item: any) => void;
  onInfoClick?: (item: any) => void;
  onPlayClick?: (item: any) => void;
  onToggleFavorite?: (item: any) => void;
  onTrailerClick?: (item: any) => void;
  isFavorite?: boolean;
  /** Preview automático de trailer no hover (desktop). */
  enablePreview?: boolean;
}

export function ContentCard({
  item,
  type,
  primaryColor,
  onClick,
  onInfoClick,
  onPlayClick,
  onToggleFavorite,
  onTrailerClick,
  isFavorite,
  enablePreview = false,
}: ContentCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const title = item.name || item.title;
  const image = item.stream_icon || item.cover || item.series_icon;
  const rating = getRating(item);
  const year = getYear(item);
  const quality = detectQuality(item);
  const isLive = type === "live";

  const { trailerKey, reportBlocked } = useHoverTrailer(
    title,
    type === "series" ? "series" : "movie",
    enablePreview && !isLive && isHovered,
  );

  return (
    <div
      className="group relative flex flex-col gap-2 hover:z-20"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-neutral-900 shadow-lg cursor-pointer transition-colors duration-150",
          isHovered ? "ring-2" : "",
        )}
        style={isHovered ? { ["--tw-ring-color" as any]: primaryColor } : {}}
        onClick={() => onClick(item)}
      >
        <div className={cn("w-full bg-neutral-800", isLive ? "aspect-video" : "aspect-[2/3]")}>
          {image ? (
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <Play className="h-10 w-10 opacity-20" />
            </div>
          )}

          {/* Preview de trailer (mudo) — só trailers que aceitam incorporação.
              Se o embed falhar, volta automaticamente para a capa. */}
          {trailerKey && isHovered && (
            <iframe
              key={trailerKey}
              className="absolute inset-0 h-full w-full object-cover opacity-0 animate-[fadeIn_.4s_ease-out_forwards] pointer-events-none"
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0&loop=1&playlist=${trailerKey}`}
              title={`Prévia de ${title}`}
              allow="autoplay; encrypted-media"
              loading="lazy"
              onError={() => reportBlocked(trailerKey)}
              style={{ opacity: 1 }}
            />
          )}
        </div>

        {/* Ações rápidas no hover */}
        <div
          className={cn(
            "absolute inset-0 bg-black/55 flex items-center justify-center gap-2.5 transition-opacity duration-150",
            isHovered ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <button
            aria-label="Assistir"
            onClick={(e) => {
              e.stopPropagation();
              (onPlayClick ?? onClick)(item);
            }}
            className="h-11 w-11 rounded-full flex items-center justify-center text-white shadow-xl active:scale-90"
            style={{ backgroundColor: primaryColor }}
          >
            <Play className="h-5 w-5 fill-white ml-0.5" />
          </button>
          {onToggleFavorite && (
            <button
              aria-label="Adicionar à minha lista"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(item);
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center bg-white/10 border border-white/20 text-white active:scale-90"
            >
              {isFavorite ? <Check className="h-4.5 w-4.5 text-emerald-400" /> : <Plus className="h-4.5 w-4.5" />}
            </button>
          )}
          {onTrailerClick && !isLive && (
            <button
              aria-label="Ver trailer"
              onClick={(e) => {
                e.stopPropagation();
                onTrailerClick(item);
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center bg-white/10 border border-white/20 text-white active:scale-90"
            >
              <Film className="h-4.5 w-4.5" />
            </button>
          )}
          {onInfoClick && (
            <button
              aria-label="Ver detalhes"
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick(item);
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center bg-white/10 border border-white/20 text-white active:scale-90"
            >
              <Info className="h-4.5 w-4.5" />
            </button>
          )}
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {isLive && (
            <span className="px-2 py-0.5 rounded bg-red-600 text-[10px] font-bold uppercase tracking-wider text-white">
              AO VIVO
            </span>
          )}
          {quality && quality !== "SD" && (
            <span className="px-2 py-0.5 rounded bg-black/70 border border-white/15 text-[10px] font-bold uppercase tracking-wider text-white">
              {quality}
            </span>
          )}
        </div>
      </div>

      <div className="px-1 py-1">
        <h3
          className="text-sm font-semibold truncate text-white/90"
          style={isHovered ? { color: primaryColor } : {}}
        >
          {title}
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] text-white/40 mt-0.5 font-medium">
          {rating > 0 && (
            <span className="flex items-center gap-0.5 text-yellow-500">
              <Star className="h-3 w-3 fill-yellow-500" />
              {rating.toFixed(1)}
            </span>
          )}
          {year && <span>· {year}</span>}
          {quality && <span>· {quality}</span>}
        </div>
      </div>
    </div>
  );
}
