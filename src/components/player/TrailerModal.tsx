import { X, Loader2, Film } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getTMDBMetadata } from "@/lib/player.functions";

interface TrailerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type: "movie" | "series";
}

/**
 * Trailer sob demanda: só busca no TMDB e só carrega o iframe
 * depois que o usuário abre o modal (zero consumo de banda na Home).
 */
export function TrailerModal({ isOpen, onClose, title, type }: TrailerModalProps) {
  const cleanTitle = (title || "")
    .replace(/\b(4K|FHD|HD|SD|720p|1080p|2160p)\b/gi, "")
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .trim();

  const { data, isLoading } = useQuery({
    queryKey: ["tmdb-trailer", cleanTitle, type],
    queryFn: () =>
      getTMDBMetadata({ data: { title: cleanTitle, type: type === "series" ? "tv" : "movie" } }),
    enabled: isOpen && !!cleanTitle,
    staleTime: 1000 * 60 * 60 * 24,
  });

  if (!isOpen) return null;

  const key = (data as any)?.trailer_key;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden border border-white/10 bg-[#0a0a0a] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white/70 hover:text-white"
          aria-label="Fechar trailer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="aspect-video w-full flex items-center justify-center bg-black">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-white/50">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-[0.25em]">Buscando trailer</span>
            </div>
          ) : key ? (
            <iframe
              className="w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0`}
              title={`Trailer de ${cleanTitle}`}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/40">
              <Film className="h-8 w-8" />
              <span className="text-sm font-medium">Trailer indisponível para este título.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
