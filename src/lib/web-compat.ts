/**
 * Teste de compatibilidade Web do conteúdo.
 *
 * O proxy de stream (`/api/public/core/stream`) já analisa o cabeçalho real do
 * arquivo no Core e devolve os codecs detectados nos headers
 * `X-Playback-Codec-Video` / `X-Playback-Codec-Audio` / `X-Playback-Action`.
 * Aqui apenas transformamos isso num veredito legível para o cliente final.
 *
 * Camada futura (remux/transcode):
 *   Servidor IPTV → Core → FFmpeg (remux/transcode) → Web Player
 * Quando `action` for "remux" ou "transcode", o conteúdo precisa passar por
 * essa camada antes de tocar no navegador.
 */

export type WebCompatResult = {
  ok: boolean;
  container: string | null;
  video: string | null;
  audio: string | null;
  action: "direct" | "remux" | "transcode";
  via: string | null;
  status: number | string | null;
  label: string;
  detail: string;
};

export const NEEDS_CONVERSION_MESSAGE =
  "Este conteúdo precisa de conversão para reprodução web";

export function verdictFromHeaders(
  headers: Headers,
  status: number | string,
): WebCompatResult {
  const video = headers.get("x-playback-codec-video");
  const audio = headers.get("x-playback-codec-audio");
  const rawAction = headers.get("x-playback-action");
  const action: WebCompatResult["action"] =
    rawAction === "remux" || rawAction === "transcode" ? rawAction : "direct";
  const container =
    headers.get("x-playback-incompatible") ??
    (headers.get("content-type") ?? "").split("/").pop() ??
    null;
  const ok = action === "direct";

  const par = `${video ?? "?"}/${audio ?? "?"}`;
  return {
    ok,
    container,
    video,
    audio,
    action,
    via: headers.get("x-playback-via"),
    status,
    label: ok ? `✅ ${par} compatível` : `⚠️ ${par} precisa conversão`,
    detail: ok
      ? "O navegador consegue decodificar este conteúdo diretamente."
      : `${NEEDS_CONVERSION_MESSAGE} (${action === "transcode" ? "transcodificação de vídeo" : "remux/conversão de áudio"} no Core).`,
  };
}

/** Executa o teste consultando o proxy com um Range mínimo. */
export async function testWebCompatibility(streamUrl: string): Promise<WebCompatResult> {
  const res = await fetch(streamUrl, {
    headers: { Range: "bytes=0-1023" },
    signal: AbortSignal.timeout(25_000),
  });
  const verdict = verdictFromHeaders(res.headers, res.status);
  await res.body?.cancel();
  return verdict;
}
