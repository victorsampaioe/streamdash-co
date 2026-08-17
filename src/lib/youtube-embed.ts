/**
 * Verificação de incorporação (embed) de vídeos do YouTube — camada visual.
 *
 * Alguns trailers bloqueiam incorporação e o iframe vira a mensagem
 * "Este conteúdo está bloqueado...". O oEmbed do YouTube responde erro
 * (401/403/404) justamente nesses casos, então usamos ele como filtro
 * antes de montar qualquer iframe.
 */

const embedCache = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();

export function isEmbedKnownBlocked(key: string) {
  return embedCache.get(key) === false;
}

export async function checkEmbeddable(key: string): Promise<boolean> {
  if (!key) return false;
  const cached = embedCache.get(key);
  if (cached !== undefined) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${key}`
        )}`,
        { mode: "cors" }
      );
      const ok = res.ok;
      embedCache.set(key, ok);
      return ok;
    } catch {
      // Falha de rede/CORS não prova bloqueio — assumimos permitido e o
      // onError do iframe cuida do fallback para a capa.
      embedCache.set(key, true);
      return true;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Marca um vídeo como bloqueado (usado quando o iframe falha em tela). */
export function markEmbedBlocked(key: string) {
  if (key) embedCache.set(key, false);
}

/** Primeiro candidato que aceita incorporação; null se nenhum aceitar. */
export async function pickEmbeddableKey(keys: (string | undefined | null)[]): Promise<string | null> {
  for (const key of keys) {
    if (!key) continue;
    if (embedCache.get(key) === false) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await checkEmbeddable(key)) return key;
  }
  return null;
}
