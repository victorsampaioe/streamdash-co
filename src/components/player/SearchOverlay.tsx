import { Search, X, Play, Tv, Film, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ContentCard } from "./ContentCard";
import { getPlayerCatalog } from "@/lib/player.functions";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  primaryColor?: string;
  onPlay: (item: any, type: any) => void;
}

export function SearchOverlay({ isOpen, onClose, token, primaryColor, onPlay }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ live: any[], vod: any[], series: any[] }>({
    live: [],
    vod: [],
    series: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 3) {
      setResults({ live: [], vod: [], series: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [live, vod, series] = await Promise.all([
          getPlayerCatalog({ data: { token, action: "get_live_streams", limit: 100 } }).catch(() => []),
          getPlayerCatalog({ data: { token, action: "get_vod_streams", limit: 100 } }).catch(() => []),
          getPlayerCatalog({ data: { token, action: "get_series", limit: 100 } }).catch(() => [])
        ]);

        const filter = (list: any[]) => 
          Array.isArray(list) ? list.filter(i => {
            const name = (i.name || i.title || "").toLowerCase();
            const search = query.toLowerCase();
            return name.includes(search);
          }) : [];

        setResults({
          live: filter(live as any[]),
          vod: filter(vod as any[]),
          series: filter(series as any[])
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query, token]);

  if (!isOpen) return null;

  const totalResults = results.live.length + results.vod.length + results.series.length;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950/95 backdrop-blur-2xl animate-in fade-in duration-300 overflow-y-auto">
      <div className="container max-w-6xl mx-auto px-6 py-12 pb-32">
        <div className="flex items-center justify-between mb-12 sticky top-0 bg-neutral-950/95 py-4 z-10">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-white/40" />
            <Input 
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por filmes, séries ou canais..."
              className="w-full h-16 bg-white/5 border-white/10 pl-14 pr-6 text-xl rounded-2xl focus:ring-primary/20 transition-all text-white"
            />
          </div>
          <button 
            onClick={onClose}
            className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors ml-4 text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-white/40">
            <Loader2 className="h-12 w-12 animate-spin mb-4" />
            <p className="text-lg">Buscando no catálogo...</p>
          </div>
        )}

        {!loading && !query && (
          <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-white/40 text-sm font-bold uppercase tracking-widest mb-6">Sugestões de busca</h3>
              <div className="flex flex-wrap gap-3">
                {["Filmes de Ação", "Esporte", "Premium", "Documentários", "Infantil"].map(tag => (
                  <button 
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-primary/50 transition-colors text-white/80"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && query && query.length >= 3 && totalResults === 0 && (
          <div className="text-center py-20 text-white/40">
            <Search className="h-16 w-16 mx-auto mb-4" />
            <p className="text-lg font-medium text-white">Nenhum resultado para "{query}"</p>
            <p className="text-sm">Tente termos mais genéricos.</p>
          </div>
        )}

        {!loading && query && query.length >= 3 && totalResults > 0 && (
          <div className="space-y-12">
            {results.live.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Tv className="h-5 w-5 text-primary" style={{ color: primaryColor }} />
                  📡 Canais encontrados ({results.live.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {results.live.map(item => (
                    <ContentCard key={item.stream_id} item={item} type="live" primaryColor={primaryColor} onClick={(i) => onPlay(i, "live")} />
                  ))}
                </div>
              </div>
            )}

            {results.vod.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Film className="h-5 w-5 text-primary" style={{ color: primaryColor }} />
                  🎬 Filmes encontrados ({results.vod.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {results.vod.map(item => (
                    <ContentCard key={item.stream_id} item={item} type="movie" primaryColor={primaryColor} onClick={(i) => onPlay(i, "movie")} />
                  ))}
                </div>
              </div>
            )}

            {results.series.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Play className="h-5 w-5 text-primary" style={{ color: primaryColor }} />
                  📺 Séries encontradas ({results.series.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {results.series.map(item => (
                    <ContentCard key={item.series_id} item={item} type="series" primaryColor={primaryColor} onClick={(i) => onPlay(i, "series")} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}