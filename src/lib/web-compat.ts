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
  /** Diagnóstico de transporte (Range/Content-Type/Length). */
  transport?: {
    contentType: string | null;
    acceptRanges: string | null;
    contentLength: string | null;
    contentRange: string | null;
    firstRange: string;
    midRange: string;
    ok: boolean;
    notes: string[];
  };
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

/**
 * Executa o teste completo de reprodução:
 * 1) Range inicial (0-1023) → codec, Content-Type, Accept-Ranges, Content-Length;
 * 2) Range intermediário → confirma seek real (206 + Content-Range coerente).
 */
export async function testWebCompatibility(streamUrl: string): Promise<WebCompatResult> {
  const res = await fetch(streamUrl, {
    headers: { Range: "bytes=0-1023" },
    signal: AbortSignal.timeout(25_000),
  });
  const verdict = verdictFromHeaders(res.headers, res.status);
  const contentType = res.headers.get("content-type");
  const acceptRanges = res.headers.get("accept-ranges");
  const contentRange = res.headers.get("content-range");
  const contentLength = res.headers.get("content-length");
  await res.body?.cancel();

  const notes: string[] = [];
  if (res.status !== 206) notes.push(`Range inicial devolveu ${res.status} (esperado 206)`);
  if (!/^video\//i.test(contentType ?? "")) notes.push(`Content-Type inesperado: ${contentType ?? "ausente"}`);
  if (!acceptRanges) notes.push("Accept-Ranges ausente");
  if (!contentLength) notes.push("Content-Length ausente");

  // Tamanho total vindo de "bytes 0-1023/TOTAL".
  const total = Number(contentRange?.split("/")?.[1] ?? 0);
  const inicio = Number.isFinite(total) && total > 4_000_000 ? Math.floor(total / 2) : 1_048_576;
  const midRange = `bytes=${inicio}-${inicio + 1023}`;
  let midStatus: number | string = "-";
  let midContentRange: string | null = null;
  try {
    const res2 = await fetch(streamUrl, {
      headers: { Range: midRange },
      signal: AbortSignal.timeout(25_000),
    });
    midStatus = res2.status;
    midContentRange = res2.headers.get("content-range");
    await res2.body?.cancel();
    if (res2.status !== 206) notes.push(`Range intermediário devolveu ${res2.status} (seek indisponível)`);
    else if (midContentRange && !midContentRange.includes(String(inicio)))
      notes.push(`Content-Range divergente no seek: ${midContentRange}`);
  } catch (e) {
    notes.push(`Falha no Range intermediário: ${(e as Error).message}`);
  }

  verdict.transport = {
    contentType,
    acceptRanges,
    contentLength,
    contentRange: midContentRange ?? contentRange,
    firstRange: `bytes=0-1023 → ${res.status}`,
    midRange: `${midRange} → ${midStatus}`,
    ok: notes.length === 0,
    notes,
  };

  if (notes.length && verdict.ok) {
    verdict.label = "⚠️ transporte com inconsistências";
    verdict.detail = notes.join(" • ");
  }
  return verdict;
}

