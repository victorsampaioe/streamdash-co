import { useEffect, useRef, useState } from "react";
import { getTMDBMetadata } from "@/lib/player.functions";

/** Cache global de trailers já resolvidos (evita repetir chamadas TMDB). */
const trailerCache = new Map<string, string | null>();

function cleanTitle(title: string) {
  return (title || "")
    .replace(/\b(4K|FHD|HD|SD|720p|1080p|2160p|L|D|DUB|LEG)\b/gi, "")
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .trim();
}

export function isTouchDevice() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

/**
 * Preview de trailer no hover — apenas camada visual.
 * - só dispara depois de ~1,5s de hover
 * - só carrega o item em foco (nunca em lote)
 * - libera o vídeo assim que o mouse sai
 * - desativado em telas de toque
 */
export function useHoverTrailer(title: string, type: "movie" | "series", enabled: boolean) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!enabled || !title || isTouchDevice()) {
      setTrailerKey(null);
      return;
    }

    const key = `${type}:${cleanTitle(title).toLowerCase()}`;
    const cached = trailerCache.get(key);
    if (cached !== undefined) {
      timerRef.current = setTimeout(() => aliveRef.current && setTrailerKey(cached), 1500);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    timerRef.current = setTimeout(async () => {
      try {
        const meta: any = await getTMDBMetadata({
          data: { title: cleanTitle(title), type: type === "series" ? "tv" : "movie" },
        });
        const found = meta?.trailer_key ?? null;
        trailerCache.set(key, found);
        if (aliveRef.current) setTrailerKey(found);
      } catch {
        trailerCache.set(key, null);
      }
    }, 1500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, type, enabled]);

  // Libera memória ao sair do hover
  useEffect(() => {
    if (!enabled) setTrailerKey(null);
  }, [enabled]);

  return trailerKey;
}
