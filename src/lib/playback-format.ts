/**
 * Compatibilidade de containers com reprodução direta no navegador.
 * Usado pelo Player (cliente) e pelo proxy do Core (servidor) para
 * registrar o motivo real de uma falha em vez de mostrar tela preta.
 */

/** Containers que o <video> / HLS.js conseguem decodificar nativamente. */
export const BROWSER_PLAYABLE = ["mp4", "m4v", "mov", "webm", "m3u8", "ts", "mpegts"] as const;

/** Containers conhecidos que o navegador NÃO reproduz sem remux/transcode. */
export const BROWSER_INCOMPATIBLE = ["mkv", "avi", "flv", "wmv", "mpg", "mpeg", "rmvb", "divx"] as const;

export function normalizeExt(ext?: string | null): string {
  return String(ext ?? "")
    .toLowerCase()
    .replace(/^\./, "")
    .replace(/\?.*$/, "")
    .trim();
}

export function isBrowserPlayable(ext?: string | null): boolean {
  const e = normalizeExt(ext);
  if (!e) return true; // desconhecido: deixa o player tentar
  if ((BROWSER_INCOMPATIBLE as readonly string[]).includes(e)) return false;
  return true;
}

/** Motivo legível apresentado ao usuário e gravado no diagnóstico. */
export function incompatibleReason(ext?: string | null): string {
  const e = normalizeExt(ext) || "desconhecido";
  return `Formato não compatível com reprodução direta no navegador (.${e}). O servidor respondeu normalmente, porém o container do vídeo não pode ser decodificado pelo navegador.`;
}
