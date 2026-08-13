import { Search, X, Play, Tv, Film } from "lucide-react";
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
        // En um cenário real, teríamos um endpoint de busca global.
        // Aqui simulamos buscando em algumas categorias ou usando a lógica de filtro se já tivéssemos o catálogo completo.
        // Por agora, como o catálogo é paginado/por categoria, vamos apenas filtrar se tivermos algo ou mostrar placeholder.
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950/95 backdrop-blur-2xl animate-in fade-in duration-300 overflow-y-auto">
      <div className="container max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-12">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-white/40" />
            <Input 
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por filmes, séries ou canais..."
              className="w-full h-16 bg-white/5 border-white/10 pl-14 pr-6 text-xl rounded-2xl focus:ring-primary/20 transition-all"
            />
          </div>
          <button 
            onClick={onClose}
            className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors ml-4"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {!query && (
          <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-white/40 text-sm font-bold uppercase tracking-widest mb-6">Sugestões de busca</h3>
              <div className="flex flex-wrap gap-3">
                {["Filmes de Ação", "Canais de Esporte", "Séries Premium", "Documentários", "Infantil"].map(tag => (
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

        {query && query.length >= 3 && (
          <div className="space-y-12">
             <div className="text-center py-20 opacity-40">
                <Search className="h-16 w-16 mx-auto mb-4" />
                <p className="text-lg">Nenhum resultado encontrado para "{query}"</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
