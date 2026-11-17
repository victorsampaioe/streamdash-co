/** Lightweight H.264 output presets for client-side MP4 recording.
 * Source video remains untouched. Older phones often cannot decode a 1080p
 * source AND paint/encode an additional 1080p canvas at 30fps in real time.
 * Keep both dimensions even for widest H.264 hardware compatibility.
 */
export type ResellerVideoQuality="auto"|"compatible"|"high";
export type VideoDeviceHints={hardwareConcurrency?:number;deviceMemory?:number};
export function getVideoDeviceHints():VideoDeviceHints{
  if(typeof navigator==="undefined")return {};
  return {
    hardwareConcurrency:navigator.hardwareConcurrency,
    deviceMemory:(navigator as Navigator & {deviceMemory?:number}).deviceMemory
  };
}
export function getResellerEncodingSettings(
  sourceWidth:number,sourceHeight:number,quality:ResellerVideoQuality="auto",
  hints:VideoDeviceHints=getVideoDeviceHints(),
){
  if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||
     sourceWidth<128||sourceHeight<128)
    throw new Error("Dimensões do vídeo de origem inválidas.");
  const lowerPower=(hints.hardwareConcurrency!==undefined&&hints.hardwareConcurrency<=4)||
    (hints.deviceMemory!==undefined&&hints.deviceMemory<=3);
  const mode=quality==="auto"?(lowerPower?"compatible":"balanced"):quality;
  const longest=Math.max(sourceWidth,sourceHeight);
  const maxLongSide=mode==="high"?1920:mode==="compatible"?960:1280;
  const scale=Math.min(1,maxLongSide/longest);
  const width=Math.max(2,Math.floor(sourceWidth*scale/2)*2);
  const height=Math.max(2,Math.floor(sourceHeight*scale/2)*2);
  return {
    width,height,
    fps:mode==="high"?30:24,
    bitrate:mode==="high"?3_000_000:mode==="compatible"?1_100_000:1_800_000,
    mode,
  } as const;
}
