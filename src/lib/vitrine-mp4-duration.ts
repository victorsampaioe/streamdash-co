/**
 * Safari/iOS MediaRecorder can write an "unknown" 32-bit movie duration
 * (0xffffffff). With timescale 600, iOS Photos/Quick Look presents it as
 * around 1988 hours of remaining playback.
 *
 * This narrowly repairs movie/track/media header duration fields in a
 * finalized progressive MP4. The encoded video/audio packets are unchanged.
 * Callers must still verify the real sample duration: changing headers alone
 * cannot repair malformed timestamp samples.
 */
export function repairMp4DurationHeaders(
  buffer: ArrayBuffer,
  expectedSeconds: number,
): { repaired: string[]; movieDuration: number | null } {
  if (!Number.isFinite(expectedSeconds) || expectedSeconds < 0.5 || expectedSeconds > 120) {
    throw new Error("A duração esperada do vídeo é inválida.");
  }
  const view = new DataView(buffer);
  const repaired: string[] = [];
  let movieScale = 0;
  let movieDuration: number | null = null;
  type Box = { name: string; offset: number; header: number; end: number };
  const boxes: Box[] = [];
  function scan(start: number, end: number, depth: number) {
    if (depth > 4) return;
    let offset = start;
    while (offset + 8 <= end) {
      const value = view.getUint32(offset);
      let header = 8;
      let size = value;
      if (size === 1) {
        if (offset + 16 > end) throw new Error("MP4 com caixa larga incompleta.");
        const large = view.getBigUint64(offset + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MP4 com tamanho incompatível.");
        size = Number(large);
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) throw new Error("MP4 com cabeçalho inválido.");
      const name = String.fromCharCode(
        view.getUint8(offset + 4), view.getUint8(offset + 5),
        view.getUint8(offset + 6), view.getUint8(offset + 7),
      );
      const box: Box = { name, offset, header, end: offset + size };
      if (["mvhd", "tkhd", "mdhd"].includes(name)) boxes.push(box);
      if (name === "moov" || name === "trak" || name === "mdia") {
        scan(offset + header, offset + size, depth + 1);
      }
      offset += size;
    }
  }
  scan(0, buffer.byteLength, 0);

  const movie = boxes.find(b => b.name === "mvhd");
  if (!movie) throw new Error("O MP4 não contém cabeçalho de duração (moov/mvhd).");

  function readTimeScale(box: Box): number {
    const p = box.offset + box.header;
    if (p + 4 > box.end) throw new Error("Cabeçalho de duração incompleto.");
    const version = view.getUint8(p);
    if (version !== 0 && version !== 1) throw new Error("Versão MP4 não suportada.");
    const where = p + (version === 1 ? 20 : 12);
    if (where + 4 > box.end) throw new Error("Escala de tempo MP4 incompleta.");
    const scale = view.getUint32(where);
    if (!scale || scale > 1_000_000_000) throw new Error("Escala de tempo do MP4 inválida.");
    return scale;
  }
  movieScale = readTimeScale(movie);

  function inspectAndRepair(box: Box) {
    const p = box.offset + box.header;
    if (p + 4 > box.end) return;
    const version = view.getUint8(p);
    if (version !== 0 && version !== 1) return;
    const scale = box.name === "mdhd" ? readTimeScale(box) : movieScale;
    const position = p + (
      box.name === "tkhd"
        ? (version === 1 ? 28 : 20)
        : (version === 1 ? 24 : 16)
    );
    const bytes = version === 1 ? 8 : 4;
    if (position + bytes > box.end) return;
    const current = version === 1 ? view.getBigUint64(position) : BigInt(view.getUint32(position));
    const max = version === 1 ? 0xffffffffffffffffn : 0xffffffffn;
    const durationSeconds = Number(current) / scale;
    const invalid = current === 0n || current === max ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds > Math.max(expectedSeconds * 4, expectedSeconds + 30);
    if (invalid) {
      const ticks = BigInt(Math.max(1, Math.round(expectedSeconds * scale)));
      if (ticks >= max) throw new Error("Duração fora do limite MP4.");
      if (version === 1) view.setBigUint64(position, ticks);
      else view.setUint32(position, Number(ticks));
      repaired.push(box.name);
    }
    if (box.name === "mvhd") {
      const correctedTicks = invalid ? Math.round(expectedSeconds * scale) : Number(current);
      movieDuration = correctedTicks / scale;
    }
  }
  for (const box of boxes) inspectAndRepair(box);
  if (movieDuration === null) throw new Error("Não foi possível ler a duração do MP4.");
  return { repaired, movieDuration };
}
