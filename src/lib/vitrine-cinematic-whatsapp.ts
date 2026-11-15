import {
  ALL_FORMATS, BlobSource, BufferTarget, Conversion,
  Input, Mp4OutputFormat, Output,
} from "mediabunny";

/**
 * Convert browser-recorded fragmented MP4 (ftyp/moov/moof/mdat)
 * into standard progressive fast-start MP4 (ftyp/moov/mdat).
 *
 * The compressed H.264/AAC packets are copied without re-encoding:
 * this is vastly lighter than FFmpeg or recording the movie again.
 *
 * No server uploads, no additional fees, no video capture. The original
 * blob is never altered. The result is intended for easy import into
 * WhatsApp, Instagram and the phone gallery.
 */
export async function finalizeCinematicMp4(
  source: Blob,
  progress?: (ratio: number) => void,
): Promise<Blob> {
  if(source.size < 1024 || source.size > 150 * 1024 * 1024)
    throw new Error("Escolha um vídeo MP4 entre 1 KB e 150 MB para corrigir.");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(source),
  });
  try {
    const video = await input.getPrimaryVideoTrack();
    if(!video || await video.getCodec() !== "avc")
      throw new Error("O vídeo precisa estar codificado em H.264 para enviar ao WhatsApp.");
    const audio = await input.getPrimaryAudioTrack();
    if(audio && await audio.getCodec() !== "aac")
      throw new Error("O áudio deste vídeo não é AAC. Exporte novamente escolhendo áudio AAC.");

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({fastStart:"in-memory"}),
      target,
    });
    const conversion = await Conversion.init({
      input, output,
      copy: {mode:"forced"},
      tracks: "primary",
    });
    if(!conversion.isValid || conversion.discardedTracks.some(x =>
      x.track.type === "video" || x.track.type === "audio"
    )){
      throw new Error("Não foi possível finalizar os canais de vídeo e áudio. O arquivo original foi preservado.");
    }
    conversion.onProgress = ratio => progress?.(Math.min(.99, ratio));
    await conversion.execute();
    if(!target.buffer)
      throw new Error("O navegador não concluiu a finalização MP4.");
    const buffer = target.buffer;
    const dv = new DataView(buffer);
    // Validate the expected progressive, fast-start MP4 box order.
    const boxes:string[] = [];
    let offset = 0;
    while(offset + 8 <= buffer.byteLength && boxes.length < 10){
      const boxSize = dv.getUint32(offset);
      const type = String.fromCharCode(...new Uint8Array(buffer,offset+4,4));
      if(boxSize < 8 || offset + boxSize > buffer.byteLength)break;
      boxes.push(type);
      offset += boxSize;
    }
    if(boxes[0] !== "ftyp" || !boxes.includes("moov") || !boxes.includes("mdat") ||
       boxes.indexOf("moov") >= boxes.indexOf("mdat") || boxes.includes("moof"))
      throw new Error("O MP4 final não passou na verificação de compatibilidade. Nenhum arquivo incompatível foi baixado.");
    const result = new Blob([buffer],{type:"video/mp4"});
    progress?.(1);
    return result;
  } finally {
    input.dispose();
  }
}
