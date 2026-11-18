/** Adaptive MP4 presets for browser-based reseller video recording.
 * MP4 is rendered at the selected resolution (the viewer's device cannot
 * change resolution after the MP4 has been downloaded).
 *
 * IMPORTANT: Safari can clamp navigator.hardwareConcurrency to four on
 * completely different iPhone generations. Do NOT consider iPhones weak
 * merely because hardwareConcurrency <= 4.
 */
export type ResellerVideoQuality="auto"|"compatible"|"high";
export type ResellerEncodingMode="compatible"|"balanced"|"high";
export type VideoDeviceHints={
  hardwareConcurrency?:number;
  deviceMemory?:number;
  isMobile?:boolean;
  isAppleMobile?:boolean;
  iosMajor?:number;
  devicePixelRatio?:number;
  encoderSmooth?:boolean;
  encoderPowerEfficient?:boolean;
};
export function getVideoDeviceHints():VideoDeviceHints{
  if(typeof navigator==="undefined")return {};
  const ua=navigator.userAgent||"";
  const platform=navigator.platform||"";
  const isAppleMobile=/iPhone|iPad|iPod/i.test(ua)||
    (platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const iosVersion=ua.match(/(?:CPU (?:iPhone )?OS|OS) (\d+)[._]/i);
  return {
    hardwareConcurrency:navigator.hardwareConcurrency,
    deviceMemory:(navigator as Navigator & {deviceMemory?:number}).deviceMemory,
    isAppleMobile,
    isMobile:isAppleMobile||/Android|Mobile|Mobi/i.test(ua),
    iosMajor:iosVersion?Number(iosVersion[1]):undefined,
    devicePixelRatio:typeof window!=="undefined"?window.devicePixelRatio:undefined,
  };
}

/** Query the browser's actual high-definition encoder when supported.
 * Failure or an unavailable API is NOT interpreted as weak hardware.
 * Limit the probe to 500ms so older browsers never get stuck preparing.
 */
export async function getVideoEncodingHints():Promise<VideoDeviceHints>{
  const hints=getVideoDeviceHints();
  if(typeof navigator==="undefined"||!navigator.mediaCapabilities?.encodingInfo)
    return hints;
  const result=await new Promise<{supported:boolean;smooth:boolean;powerEfficient:boolean}|null>(resolve=>{
    let settled=false;
    const finish=(v:{supported:boolean;smooth:boolean;powerEfficient:boolean}|null)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer=setTimeout(()=>finish(null),500);
    try{
      void navigator.mediaCapabilities.encodingInfo({
        type:"record",
        video:{
          contentType:'video/mp4; codecs="avc1.42E01E"',
          width:1080,height:1920,bitrate:5_000_000,framerate:30,
        },
      }).then(info=>finish({
        supported:info.supported,smooth:info.smooth,powerEfficient:info.powerEfficient,
      })).catch(()=>finish(null));
    }catch{finish(null);}
  });
  if(result?.supported){
    hints.encoderSmooth=result.smooth;
    hints.encoderPowerEfficient=result.powerEfficient;
  }
  // Some Safari builds reject the codec label in MediaCapabilities even
  // though MediaRecorder can export this MP4. A 'not supported' probe is
  // inconclusive; keep the device heuristic rather than forcing 720p.
  return hints;
}

/** Select maximum quality on capable devices, retaining the lighter
 * 480p preset on weak phones. Defaults conservatively when capabilities
 * are hidden, without mistakenly downgrading modern iPhones to 480p.
 */
export function resolveResellerEncodingMode(
  quality:ResellerVideoQuality,hints:VideoDeviceHints,
):ResellerEncodingMode{
  if(quality!=="auto")return quality;
  const cores=hints.hardwareConcurrency;
  const memory=hints.deviceMemory;
  if(memory!==undefined&&memory<=3)return "compatible";
  if(hints.encoderSmooth===false){
    return hints.isMobile && memory!==undefined&&memory<=4?"compatible":"balanced";
  }
  if(hints.isAppleMobile){
    // iPhones can all report 4 logical cores; using that number previously
    // forced even current-generation hardware into blurry 480p output.
    if(hints.encoderSmooth===true&&hints.encoderPowerEfficient===true)
      return "high";
    if(hints.iosMajor!==undefined&&hints.iosMajor>=18&&
       (hints.devicePixelRatio??0)>=3)return "high";
    if(hints.iosMajor!==undefined&&hints.iosMajor<17)return "compatible";
    return "balanced";
  }
  if(hints.encoderSmooth===true&&(cores!==undefined&&cores>=6||
      memory!==undefined&&memory>=6))return "high";
  if(cores!==undefined&&cores>=8&&(memory===undefined||memory>=4))
    return "high";
  if(memory!==undefined&&memory>=6&&cores!==undefined&&cores>=6)
    return "high";
  if(hints.isMobile&&cores!==undefined&&cores<=4&&
    (memory===undefined||memory<=4))return "compatible";
  return "balanced";
}
export function getResellerEncodingSettings(
  sourceWidth:number,sourceHeight:number,quality:ResellerVideoQuality="auto",
  hints:VideoDeviceHints=getVideoDeviceHints(),
){
  if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||
     sourceWidth<128||sourceHeight<128)
    throw new Error("Dimensões do vídeo de origem inválidas.");
  const mode=resolveResellerEncodingMode(quality,hints);
  const longest=Math.max(sourceWidth,sourceHeight);
  const maxLongSide=mode==="high"?1920:mode==="compatible"?854:1280;
  const scale=Math.min(1,maxLongSide/longest);
  const width=Math.max(2,Math.floor(sourceWidth*scale/2)*2);
  const height=Math.max(2,Math.floor(sourceHeight*scale/2)*2);
  return {
    width,height,
    fps:mode==="high"?30:24,
    bitrate:mode==="high"?5_000_000:mode==="compatible"?950_000:2_400_000,
    mode,
  } as const;
}

/** Maintain average capture cadence on 60/120Hz displays. Comparing against
 * last *paint* time rounds 24fps up to 50ms on 60Hz displays (only 20fps).
 * Advance a fixed timeline instead, allowing alternating 33/50ms rAF ticks.
 */
export function nextResellerFrameDeadline(now:number,previousDeadline:number,fps:number){
  const interval=1000/fps;
  if(!previousDeadline)return now+interval;
  const next=previousDeadline+interval;
  return next>now+.001?next:now+interval;
}
