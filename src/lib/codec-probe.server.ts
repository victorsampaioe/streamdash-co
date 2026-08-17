/**
 * Detecção do codec real de um arquivo de mídia (MP4/MKV/TS).
 *
 * O container pode ser suportado pelo navegador (mp4) e ainda assim o vídeo
 * não tocar: é o caso de H.265/HEVC ou áudio AC3/EAC3/DTS, que produzem
 * `DEMUXER_ERROR_NO_SUPPORTED_STREAMS`. Aqui lemos apenas os primeiros bytes
 * do arquivo e identificamos as assinaturas (fourcc) dos codecs.
 */

export type CodecInfo = {
  video: string | null;
  audio: string | null;
  container: string;
  browserSupported: boolean;
  reason: string | null;
  action: "direct" | "remux" | "transcode";
};

const VIDEO_FOURCC: Array<[string, string]> = [
  ["hvc1", "H265/HEVC"],
  ["hev1", "H265/HEVC"],
  ["hvcC", "H265/HEVC"],
  ["av01", "AV1"],
  ["vp09", "VP9"],
  ["avc1", "H264"],
  ["avc3", "H264"],
  ["mp4v", "MPEG-4 Visual"],
];

const AUDIO_FOURCC: Array<[string, string]> = [
  ["ec-3", "EAC3"],
  ["ac-3", "AC3"],
  ["dtsc", "DTS"],
  ["dtsh", "DTS"],
  ["dtsl", "DTS"],
  ["mlpa", "TrueHD"],
  ["Opus", "Opus"],
  ["mp4a", "AAC"],
];

const MKV_CODEC_IDS: Array<[string, string, "video" | "audio"]> = [
  ["V_MPEGH/ISO/HEVC", "H265/HEVC", "video"],
  ["V_MPEG4/ISO/AVC", "H264", "video"],
  ["V_AV1", "AV1", "video"],
  ["A_AC3", "AC3", "audio"],
  ["A_EAC3", "EAC3", "audio"],
  ["A_DTS", "DTS", "audio"],
  ["A_AAC", "AAC", "audio"],
  ["A_OPUS", "Opus", "audio"],
];

const BROWSER_VIDEO_OK = new Set(["H264", "VP9", "AV1"]);
const BROWSER_AUDIO_OK = new Set(["AAC", "Opus", "MP3"]);

/** Lê os fourcc/CodecIDs presentes no cabeçalho do arquivo. */
export function sniffCodecs(bytes: Uint8Array, container: string): CodecInfo {
  const ascii = Array.from(bytes, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "\u0000")).join("");

  let video: string | null = null;
  let audio: string | null = null;

  for (const [tag, name] of VIDEO_FOURCC) {
    if (ascii.includes(tag)) { video = name; break; }
  }
  for (const [tag, name] of AUDIO_FOURCC) {
    if (ascii.includes(tag)) { audio = name; break; }
  }
  for (const [id, name, kind] of MKV_CODEC_IDS) {
    if (!ascii.includes(id)) continue;
    if (kind === "video" && !video) video = name;
    if (kind === "audio" && !audio) audio = name;
  }

  const containerOk = ["mp4", "m4v", "mov", "webm", "m3u8", "ts", "mpegts"].includes(container);
  const videoOk = video ? BROWSER_VIDEO_OK.has(video) : true;
  const audioOk = audio ? BROWSER_AUDIO_OK.has(audio) : true;
  const browserSupported = containerOk && videoOk && audioOk;

  const problemas: string[] = [];
  if (!containerOk) problemas.push(`container .${container}`);
  if (!videoOk) problemas.push(`vídeo ${video}`);
  if (!audioOk) problemas.push(`áudio ${audio}`);

  const reason = browserSupported
    ? null
    : `O arquivo está sendo entregue normalmente pelo servidor, mas o navegador não decodifica ${problemas.join(" + ")}. ` +
      (!videoOk
        ? "É necessário transcodificar o vídeo (H265 → H264)."
        : "É necessário remuxar/converter o áudio (ex.: AC3/DTS → AAC).");

  const action: CodecInfo["action"] = browserSupported ? "direct" : !videoOk ? "transcode" : "remux";

  return { video, audio, container, browserSupported, reason, action };
}

/** Baixa apenas o cabeçalho do arquivo e identifica os codecs. */
export async function probeCodecs(
  url: string,
  container: string,
  ua: string,
): Promise<CodecInfo | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua, Accept: "*/*", Range: "bytes=0-262143" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000), // Aumentado para 30s para VOD lento
    });
    if (!res.ok && res.status !== 206) {
      await res.body?.cancel();
      return null;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return sniffCodecs(buf, container);
  } catch {
    return null;
  }
}
