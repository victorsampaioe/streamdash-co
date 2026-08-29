/** Server-only: cálculo de SHA-256 do APK publicado (nunca confiamos no hash enviado pelo navegador). */

import { isSafeHttpsUrl } from "@/lib/ssrf-guard";

const MAX_APK_BYTES = 300 * 1024 * 1024;

export type HashResult = { sha256: string; size: number };

export async function hashRemoteApk(url: string): Promise<HashResult> {
  if (!isSafeHttpsUrl(url)) throw new Error("URL de atualização inválida (use HTTPS público).");

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error("Não foi possível baixar o arquivo informado.");

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_APK_BYTES) throw new Error("Arquivo excede o tamanho permitido.");

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { sha256, size: buffer.byteLength };
}
