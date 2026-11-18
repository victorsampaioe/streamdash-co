import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { formatBrazilianWhatsApp } from "@/lib/vitrine-football-phone";
import { footballBackgroundStyle } from "@/lib/vitrine-football-color";
import { footballTeamNamePtBR, nationalTeamFlagEmoji, nationalTeamFlagFallback } from "@/lib/vitrine-football-ptbr";
import { offlineFootballFlag } from "@/lib/vitrine-football-offline-flags";
import { isVerifiedFinishedFootballMatch, parseFootballFinalScore } from "@/lib/vitrine-football-results";

/**
 * ONE renderer used by PNG download, Telegram and on-screen preview.
 * Native canvas paints fonts and actual badge pixels, bypassing Safari's
 * fragile SVG/foreignObject screenshots and any mobile CSS / layout clipping.
 * Logical art = 1080×1350; backing canvas = 2160×2700 (true 2× rendering).
 */
export const FOOTBALL_PNG_WIDTH=2160;
export const FOOTBALL_PNG_HEIGHT=2700;
export const FOOTBALL_LAYOUT_WIDTH=1080;
export const FOOTBALL_LAYOUT_HEIGHT=1350;
const SCALE=2;

export type FootballCanvasData={
  matches:FootballMatch[];day:string;accent:string;logo:string;contact:string;
  name:string;filename:string;playerPhoto?:string;kind?:"today"|"finished"|"grid";
};

const guard=(src:string)=>src?.trim()||"";
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const rad=Math.max(0,Math.min(r,w/2,h/2));
  ctx.beginPath();ctx.moveTo(x+rad,y);
  ctx.arcTo(x+w,y,x+w,y+h,rad);ctx.arcTo(x+w,y+h,x,y+h,rad);
  ctx.arcTo(x,y+h,x,y,rad);ctx.arcTo(x,y,x+w,y,rad);ctx.closePath();
}
async function loadImage(src:string,description:string,essential=true):Promise<HTMLImageElement|null>{
  if(!guard(src)){
    if(essential)throw new Error("Imagem obrigatória não disponível: "+description+".");
    return null;
  }
  const image=new Image();
  image.decoding="async";
  if(/^https?:/i.test(src))image.crossOrigin="anonymous";
  let t:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([
      new Promise<void>((resolve,reject)=>{
        image.onload=()=>resolve();
        image.onerror=()=>reject(new Error("A imagem não carregou"));
        image.src=src;
      }),
      new Promise<void>((_,reject)=>{
        t=setTimeout(()=>reject(new Error("Tempo limite ao carregar imagem")),9000);
      }),
    ]);
    if(!image.naturalWidth||!image.naturalHeight)throw new Error("Imagem vazia");
    if(typeof image.decode==="function")await image.decode().catch(()=>{});
    return image;
  }catch(error){
    if(essential)throw new Error("Não foi possível carregar "+description+"; o PNG não foi gerado incompleto. "+
      (error instanceof Error?error.message:""));
    return null;
  }finally{
    if(t)clearTimeout(t);
  }
}
/** A genuine bundled circular flag is the fallback when a national crest CDN fails. */
async function loadTeamBadge(src:string,team:string,league:string):Promise<HTMLImageElement|null>{
  const description="escudo ou bandeira de "+footballTeamNamePtBR(team);
  const original=await loadImage(src,description,false);
  if(original)return original;
  const url=nationalTeamFlagFallback(team,league);
  const code=url.match(/\/([\w-]+)\.png$/)?.[1]||"";
  const local=offlineFootballFlag(code);
  return local?loadImage(local,description,false):null;
}
function contain(ctx:CanvasRenderingContext2D,image:HTMLImageElement,
 x:number,y:number,w:number,h:number){
  const factor=Math.min(w/image.naturalWidth,h/image.naturalHeight);
  const dw=image.naturalWidth*factor,dh=image.naturalHeight*factor;
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function cover(ctx:CanvasRenderingContext2D,image:HTMLImageElement,
 x:number,y:number,w:number,h:number){
  const factor=Math.max(w/image.naturalWidth,h/image.naturalHeight);
  const dw=image.naturalWidth*factor,dh=image.naturalHeight*factor;
  ctx.drawImage(image,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function setFont(ctx:CanvasRenderingContext2D,size:number,weight=900){
  ctx.font=weight+" "+size+"px Arial, Helvetica, sans-serif";
}
function textLine(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,
 size:number,color:string,align:CanvasTextAlign="left",weight=900){
  ctx.save();ctx.textBaseline="middle";ctx.textAlign=align;ctx.fillStyle=color;
  setFont(ctx,size,weight);ctx.fillText(text,x,y);ctx.restore();
}
/** Shrink typography only within reasonable bounds; never use ellipsis for a team. */
function fitText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,
 maxWidth:number,size:number,min=14,align:CanvasTextAlign="left",
 color="#15213b",weight=900){
  ctx.save();ctx.textAlign=align;ctx.textBaseline="middle";ctx.fillStyle=color;
  let current=size;setFont(ctx,current,weight);
  while(ctx.measureText(text).width>maxWidth&&current>min){
    current--;setFont(ctx,current,weight);
  }
  if(ctx.measureText(text).width>maxWidth){
    ctx.restore();
    throw new Error("Texto muito comprido para caber no banner: "+text);
  }
  ctx.fillText(text,x,y);ctx.restore();
}
function fitTwoLines(ctx:CanvasRenderingContext2D,name:string,x:number,y:number,
 maxWidth:number,align:CanvasTextAlign){
  let font=24,lines:string[]=[];
  const words=name.trim().split(/\s+/);
  for(;font>=17;font--){
    setFont(ctx,font,950);
    lines=[];let current="";
    for(const word of words){
      const test=current?current+" "+word:word;
      if(ctx.measureText(test).width<=maxWidth)current=test;
      else if(current){lines.push(current);current=word;}else{lines.push(word);current="";}
    }
    if(current)lines.push(current);
    if(lines.length<=2&&lines.every(part=>ctx.measureText(part).width<=maxWidth))break;
  }
  if(font<17||lines.length>2)throw new Error("Não foi possível acomodar o nome do time: "+name);
  const dy=lines.length===1?0:13;
  lines.forEach((line,i)=>textLine(ctx,line,x,y-dy+i*26,font,"#17223b",align,950));
}
function channels(ctx:CanvasRenderingContext2D,entries:string[],y:number){
  const labels=entries.filter(Boolean).slice(0,3);
  if(!labels.length)labels.push("Canal a confirmar");
  const joined=labels.join(" • ");
  ctx.save();ctx.fillStyle="#23334e";ctx.textAlign="center";ctx.textBaseline="middle";
  for(let font=18;font>=13;font--){
    setFont(ctx,font,850);
    if(ctx.measureText(joined).width<=565){
      ctx.fillText(joined,350,y);ctx.restore();return;
    }
  }
  // Two rows if several broadcasters cannot fit as a single line.
  const lines:string[]=[];let line="";
  setFont(ctx,15,850);
  for(const label of labels){
    const trial=line?line+" • "+label:label;
    if(line&&ctx.measureText(trial).width>565){lines.push(line);line=label;}
    else line=trial;
  }
  if(line)lines.push(line);
  if(lines.length>2)throw new Error("Canais de transmissão muito longos para o banner.");
  lines.forEach((part,i)=>fitText(ctx,part,350,y-(lines.length===2?12:0)+i*24,
    565,15,12,"center","#23334e",850));
  ctx.restore();
}
function stampDate(day:string){
  const value=new Date(day+"T12:00:00-03:00");
  if(!Number.isFinite(value.getTime()))return day;
  return new Intl.DateTimeFormat("pt-BR",{
    timeZone:"America/Fortaleza",weekday:"long",day:"2-digit",month:"long",
  }).format(value).replace("-feira","").toUpperCase();
}
function torn(ctx:CanvasRenderingContext2D){
  ctx.save();ctx.fillStyle="#f8f8f7";
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(1080,0);
  for(let x=1080;x>=0;x-=27)ctx.lineTo(x,24+(Math.round(x/27)%2?8:0));
  ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(0,1350);ctx.lineTo(1080,1350);
  for(let x=1080;x>=0;x-=27)ctx.lineTo(x,1325+(Math.round(x/27)%2?10:-5));
  ctx.closePath();ctx.fill();ctx.restore();
}
/**
 * External logos are best-effort assets, not a reason to blank out the entire
 * poster. When an upstream image is missing, paint a visible, honest badge:
 * the country's actual flag emoji for national teams, or team initials.
 * Both preview and downloaded file come from these exact canvas pixels.
 */
export function fallbackBadgeLabel(team:string,league:string):string{
  const flag=nationalTeamFlagEmoji(team,league);
  if(flag)return flag;
  const letters=footballTeamNamePtBR(team).split(/\s+/)
    .filter(word=>word&&!/^(de|da|do|dos|das|e)$/i.test(word))
    .slice(0,2).map(word=>word[0]||"").join("").toUpperCase();
  return letters.slice(0,2)||"FC";
}
function paintFallbackBadge(ctx:CanvasRenderingContext2D,x:number,y:number,
  team:string,league:string,size=62){
  const label=fallbackBadgeLabel(team,league);
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.20)";ctx.shadowBlur=7;ctx.shadowOffsetY=2;
  ctx.fillStyle="#eef4fc";rounded(ctx,x,y,size,size,size/2);ctx.fill();
  ctx.restore();
  ctx.save();ctx.strokeStyle="#9bb7df";ctx.lineWidth=2;
  rounded(ctx,x+1,y+1,size-2,size-2,size/2);ctx.stroke();
  ctx.fillStyle="#14345d";ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.font=label.length>2
    ? "42px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif"
    : "900 23px Arial,Helvetica,sans-serif";
  ctx.fillText(label,x+size/2,y+size/2+1);
  ctx.restore();
}
function whatsappIcon(ctx:CanvasRenderingContext2D,x:number,y:number){
  ctx.save();ctx.fillStyle="#11b96d";rounded(ctx,x,y,48,48,12);ctx.fill();
  try{
    const svgPath="M16 3C8.82 3 3 8.78 3 15.94c0 2.28.6 4.5 1.72 6.47L3 29l6.77-1.77a13.06 13.06 0 0 0 6.23 1.57c7.18 0 13-5.79 13-12.94S23.18 3 16 3Zm0 23.44c-1.94 0-3.84-.52-5.49-1.5l-.39-.23-4.02 1.05 1.07-3.9-.25-.4a10.47 10.47 0 0 1-1.6-5.52c0-5.84 4.8-10.59 10.7-10.59 5.9 0 10.7 4.75 10.7 10.59S21.9 26.44 16 26.44Zm5.88-7.94c-.32-.16-1.88-.92-2.18-1.02-.29-.11-.5-.16-.71.16-.21.32-.82 1.02-1.22.18-.21-.37-.24-.69-.08-.32.16-1.35.49-2.58-1.57-.95-.84-1.59-1.87-1.77-2.19-.18-.31-.02-.48.14-.64.15-.14.32-.37.48-.55.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.71-.97-2.34-.26-.61-.52-.52-.72-.53h-.61c-.21 0-.55.08-.84.4-.29.32-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.23 3.39 5.41 4.75.76.32 1.35.52 1.81.66.76.24 1.46.2 2.01.12.61-.09 1.88-.77 2.14-1.52.26-.75.26-1.39.18-1.53-.08-.13-.29-.21-.61-.37Z";
    ctx.save();ctx.translate(x+3,y+3);ctx.scale(1.3,1.3);ctx.fillStyle="#fff";
    ctx.fill(new Path2D(svgPath));ctx.restore();
  }catch{
    ctx.strokeStyle="#fff";ctx.lineWidth=3;ctx.beginPath();
    ctx.arc(x+24,y+23,14,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="900 23px Arial";ctx.fillText("☎",x+17,y+30);
  }
  ctx.restore();
}
/** Dedicated finished-match composition using the approved poster's
 * stadium, flags, slanted headline, blue accents and WhatsApp footer.
 * The scoreboard is drawn natively, not layered over a mobile screenshot.
 */
function drawFinalScoreboard(ctx:CanvasRenderingContext2D,match:FootballMatch,
  homeBadge:HTMLImageElement|null,awayBadge:HTMLImageElement|null,
  accent:string,homeGoals:number,awayGoals:number){
  const x=48,y=360,w=984,h=675;
  ctx.save();ctx.shadowColor="rgba(0,0,0,.42)";
  ctx.shadowBlur=34;ctx.shadowOffsetY=13;
  ctx.fillStyle="#fff";rounded(ctx,x,y,w,h,32);ctx.fill();ctx.restore();
  const panel=ctx.createLinearGradient(x,y,x+w,y+h);
  panel.addColorStop(0,"#ffffff");panel.addColorStop(.63,"#eef5ff");
  panel.addColorStop(1,"#ffffff");
  ctx.save();rounded(ctx,x,y,w,h,32);ctx.clip();
  ctx.fillStyle=panel;ctx.fillRect(x,y,w,h);ctx.restore();
  ctx.strokeStyle=accent;ctx.lineWidth=5;
  rounded(ctx,x+2,y+2,w-4,h-4,32);ctx.stroke();

  fitText(ctx,match.league.toUpperCase(),540,y+52,900,23,16,"center","#5d708c",900);
  ctx.fillStyle="#0e284f";rounded(ctx,375,y+79,330,56,18);ctx.fill();
  textLine(ctx,"APITO FINAL",540,y+107,26,"#fff","center",950);

  // Large matching circular crests, including bundled offline national flags.
  const circleSize=162,flagsY=y+205;
  if(homeBadge)contain(ctx,homeBadge,125,flagsY,circleSize,circleSize);
  else paintFallbackBadge(ctx,125,flagsY,match.home,match.league,circleSize);
  if(awayBadge)contain(ctx,awayBadge,794,flagsY,circleSize,circleSize);
  else paintFallbackBadge(ctx,794,flagsY,match.away,match.league,circleSize);

  // Score columns have dedicated widths for two-digit scores.
  ctx.save();ctx.fillStyle="#0c2344";ctx.shadowColor="rgba(20,109,242,.15)";
  ctx.shadowBlur=8;
  fitText(ctx,String(homeGoals),431,y+287,146,125,92,"center","#11294c",1000);
  fitText(ctx,String(awayGoals),649,y+287,146,125,92,"center","#11294c",1000);
  ctx.restore();
  textLine(ctx,"×",540,y+287,79,accent,"center",950);

  // Display team names below the flags, with no truncation.
  fitTwoLines(ctx,footballTeamNamePtBR(match.home),235,y+452,365,"center");
  fitTwoLines(ctx,footballTeamNamePtBR(match.away),845,y+452,365,"center");

  ctx.save();ctx.shadowColor="rgba(12,40,74,.17)";ctx.shadowBlur=12;
  const stripe=ctx.createLinearGradient(x+40,0,x+w-40,0);
  stripe.addColorStop(0,"#071f44");stripe.addColorStop(.55,accent);
  stripe.addColorStop(1,"#071f44");
  ctx.fillStyle=stripe;rounded(ctx,x+45,y+551,w-90,76,20);ctx.fill();
  ctx.restore();
  textLine(ctx,"RESULTADO FINAL",540,y+588,35,"#ffffff","center",1000);
  ctx.fillStyle=accent;rounded(ctx,x+82,y+648,w-164,4,2);ctx.fill();
}
function validatedPng(blob:Blob):Promise<void>{
  return blob.slice(0,24).arrayBuffer().then(header=>{
    if(header.byteLength!==24)throw new Error("PNG inválido: cabeçalho incompleto.");
    const d=new DataView(header);
    if(d.getUint32(0)!==0x89504e47||d.getUint32(4)!==0x0d0a1a0a||
      d.getUint32(16)!==FOOTBALL_PNG_WIDTH||d.getUint32(20)!==FOOTBALL_PNG_HEIGHT)
      throw new Error("O PNG não tem os 2160 × 2700 pixels obrigatórios.");
  });
}

/** Branded stadium backdrop: every hue is calculated from the selected swatch.
 * Stadium texture is desaturated before colorization so green grass / blue
 * floodlights never leak into the red, purple, golden or custom-color art.
 * Canvas-only rendering keeps preview, downloaded PNG and Telegram identical.
 */
function gridRgb(accent:string):[number,number,number]{
  const match=/^#([0-9a-f]{6})$/i.exec(accent);
  if(!match)return [20,109,242];
  const hex=match[1];
  return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)) as [number,number,number];
}
function gridMix(a:[number,number,number],b:[number,number,number],mix:number){
  const t=Math.max(0,Math.min(1,mix));
  const values=a.map((value,i)=>Math.round(value*(1-t)+b[i]*t));
  return "rgb("+values.join(",")+")";
}
function gridAlpha(rgb:[number,number,number],alpha:number){
  return "rgba("+rgb.join(",")+","+Math.max(0,Math.min(1,alpha))+")";
}
export function gridBackdropSwatches(accent:string){
  const rgb=gridRgb(accent),ink:[number,number,number]=[3,8,22];
  return {
    base:gridMix(rgb,ink,.72),
    shadow:gridMix(rgb,ink,.90),
    mid:gridMix(rgb,ink,.38),
    highlight:gridMix(rgb,[255,255,255],.29),
    glow:gridAlpha(rgb,.72),
    haze:gridAlpha(rgb,.27),
    rgb
  };
}
function drawAdaptiveGridBackdrop(ctx:CanvasRenderingContext2D,
  stadium:HTMLImageElement|null,accent:string){
  const palette=gridBackdropSwatches(accent);
  const base=ctx.createLinearGradient(0,0,1080,1350);
  base.addColorStop(0,palette.shadow);
  base.addColorStop(.36,palette.base);
  base.addColorStop(.74,palette.mid);
  base.addColorStop(1,palette.shadow);
  ctx.fillStyle=base;ctx.fillRect(0,0,1080,1350);
  if(stadium){
    ctx.save();
    ctx.filter="grayscale(1) contrast(1.16) brightness(.72)";
    ctx.globalAlpha=.66;
    cover(ctx,stadium,0,0,1080,1350);
    ctx.restore();
    // The *entire* stadium, including the pitch, follows the swatch.
    ctx.save();
    ctx.globalCompositeOperation="color";
    ctx.fillStyle=accent;
    ctx.fillRect(0,0,1080,1350);
    ctx.restore();
  }
  const dark=ctx.createLinearGradient(0,0,0,1350);
  dark.addColorStop(0,"rgba(1,3,15,.52)");
  dark.addColorStop(.22,"rgba(1,3,15,.32)");
  dark.addColorStop(.52,"rgba(1,3,15,.39)");
  dark.addColorStop(.77,"rgba(1,3,15,.24)");
  dark.addColorStop(1,"rgba(1,3,15,.65)");
  ctx.fillStyle=dark;ctx.fillRect(0,0,1080,1350);
  const lights=[
    {x:165,y:48,r:530,opacity:.51},
    {x:910,y:63,r:550,opacity:.44},
    {x:575,y:630,r:760,opacity:.20},
    {x:180,y:1180,r:420,opacity:.24},
    {x:925,y:1135,r:440,opacity:.21},
  ];
  for(const light of lights){
    const glow=ctx.createRadialGradient(light.x,light.y,0,
      light.x,light.y,light.r);
    glow.addColorStop(0,gridAlpha(palette.rgb,light.opacity));
    glow.addColorStop(.32,gridAlpha(palette.rgb,light.opacity*.46));
    glow.addColorStop(1,gridAlpha(palette.rgb,0));
    ctx.fillStyle=glow;ctx.fillRect(0,0,1080,1350);
  }
  // Subtle stadium floodlight cones with the SAME chosen hue.
  for(const [x,y,dx] of [[112,32,240],[976,32,-265]] as const){
    const beam=ctx.createLinearGradient(x,y,x+dx,630);
    beam.addColorStop(0,gridAlpha(palette.rgb,.39));
    beam.addColorStop(.43,gridAlpha(palette.rgb,.12));
    beam.addColorStop(1,gridAlpha(palette.rgb,0));
    ctx.fillStyle=beam;
    ctx.beginPath();ctx.moveTo(x-17,y);ctx.lineTo(x+17,y);
    ctx.lineTo(x+dx+195,650);ctx.lineTo(x+dx-195,650);
    ctx.closePath();ctx.fill();
  }
  // Discrete perimeter strokes add polish without fighting with the cards.
  ctx.save();ctx.strokeStyle=gridAlpha(palette.rgb,.33);
  ctx.lineWidth=2;
  for(const y of [288,1159]){
    ctx.beginPath();ctx.moveTo(40,y);ctx.lineTo(1040,y);ctx.stroke();
  }
  ctx.restore();
}
type BadgeCrop={x:number;y:number;width:number;height:number};
/** Strip transparent padding from provider logos (which can occupy only 20%
 * of their image box). Never trim opaque/white portions of national flags.
 */
const badgeCropCache=new WeakMap<HTMLImageElement,BadgeCrop|null>();
function trimmedBadgeCrop(image:HTMLImageElement,
  exportCanvas:HTMLCanvasElement):BadgeCrop|null{
  if(badgeCropCache.has(image))return badgeCropCache.get(image)??null;
  let result:BadgeCrop|null=null;
  try{
    const test=document.createElement("canvas");
    // Unit-test DOM mocks sometimes reuse the target canvas for all elements.
    if(test===exportCanvas) return null;
    test.width=test.height=112;
    const probe=test.getContext("2d",{willReadFrequently:true});
    if(!probe?.getImageData)return null;
    probe.clearRect(0,0,112,112);
    probe.drawImage(image,0,0,112,112);
    const pixels=probe.getImageData(0,0,112,112).data;
    let minX=112,minY=112,maxX=-1,maxY=-1,anyTransparent=false;
    for(let y=0;y<112;y++){
      for(let x=0;x<112;x++){
        const alpha=pixels[(y*112+x)*4+3];
        if(alpha<8)anyTransparent=true;
        if(alpha<28)continue;
        minX=Math.min(x,minX);maxX=Math.max(x,maxX);
        minY=Math.min(y,minY);maxY=Math.max(y,maxY);
      }
    }
    if(anyTransparent&&maxX>=minX&&maxY>=minY){
      const minRatio=.18;
      const visibleW=(maxX-minX+1)/112,visibleH=(maxY-minY+1)/112;
      // Tighten and center any image whose visible bounds include external
      // transparent padding. Fully visible circular flags stay untouched.
      if(visibleW>=minRatio&&visibleH>=minRatio &&
        (visibleW<.98||visibleH<.98)){
        const pad=2;
        const x=Math.max(0,minX-pad),y=Math.max(0,minY-pad);
        const w=Math.min(112-x,maxX+pad-x+1);
        const h=Math.min(112-y,maxY+pad-y+1);
        result={
          x:x/112*image.naturalWidth,y:y/112*image.naturalHeight,
          width:w/112*image.naturalWidth,height:h/112*image.naturalHeight
        };
      }
    }
    test.width=test.height=0;
  }catch{/* Cross-origin or unsupported canvas: render the original image. */}
  badgeCropCache.set(image,result);
  return result;
}
function containGridBadge(ctx:CanvasRenderingContext2D,
  image:HTMLImageElement,x:number,y:number,size:number,
  exportCanvas:HTMLCanvasElement){
  const crop=trimmedBadgeCrop(image,exportCanvas);
  if(!crop){contain(ctx,image,x,y,size,size);return;}
  const ratio=Math.min(size/crop.width,size/crop.height);
  const width=crop.width*ratio,height=crop.height*ratio;
  ctx.drawImage(image,crop.x,crop.y,crop.width,crop.height,
    x+(size-width)/2,y+(size-height)/2,width,height);
}
/** Exact second Stream Monitor template: two columns of real fixtures.
 * Shares the same source match data, renderer, reseller brand, downloaded file
 * and Telegram document. All coordinates are logical 1080×1350, x2 output.
 */
function gridTitleColor(accent:string):string{
  if(/^#146df2$/i.test(accent))return "#ffcf3e";
  const code=/^#([0-9a-f]{6})$/i.exec(accent)?.[1];
  if(!code)return "#ffcf3e";
  const r=parseInt(code.slice(0,2),16),g=parseInt(code.slice(2,4),16),b=parseInt(code.slice(4,6),16);
  return "rgb("+Math.min(255,Math.round(r*.58+255*.42))+","+
    Math.min(255,Math.round(g*.58+255*.42))+","+
    Math.min(255,Math.round(b*.58+255*.42))+")";
}
function gridBroadcast(ctx:CanvasRenderingContext2D,list:string[],x:number,y:number,width:number){
  const channelsList=list.filter(s=>!!s?.trim());
  const msg=channelsList.length?channelsList.join(" • "):"Transmissão não informada";
  ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillStyle="#18345a";
  for(let size=15;size>=10;size--){
    setFont(ctx,size,880);
    if(ctx.measureText(msg).width<=width){
      ctx.fillText(msg,x,y);ctx.restore();return;
    }
  }
  // Do not silently truncate channels; at most two centred lines.
  const lines:string[]=[];
  let active="";
  setFont(ctx,11,880);
  for(const name of channelsList.length?channelsList:["Transmissão não informada"]){
    const proposed=active?active+" • "+name:name;
    if(active&&ctx.measureText(proposed).width>width){
      lines.push(active);active=name;
    }else active=proposed;
  }
  if(active)lines.push(active);
  if(lines.length>2||lines.some(line=>ctx.measureText(line).width>width)){
    ctx.restore();throw new Error("Canais não cabem na grade com 2 colunas: "+msg);
  }
  lines.forEach((line,i)=>ctx.fillText(line,x,y-(lines.length===2?6:0)+i*12));
  ctx.restore();
}
/**
 * Approved FIXED poster templates. Do not scale, recenter or redistribute
 * cards based on how many matches have verified images. Empty slots stay
 * background, exactly as the user-approved screenshots.
 */
export function gridCardGeometry(count:number){
  const lines=Math.ceil(Math.max(1,Math.min(10,count))/2);
  return {lines,cardHeight:154,gapY:13,rowTop:322,badgeSize:109,badgeOffset:39};
}
export function classicCardGeometry(_count:number){
  return {cardHeight:153,gap:18,rowTop:367,badgeSize:54,badgeOffset:48};
}
function drawTwoColumnGrid(ctx:CanvasRenderingContext2D,rows:FootballMatch[],
  badges:(HTMLImageElement|null)[],accent:string,day:string,
  brand:HTMLImageElement|null,exportCanvas:HTMLCanvasElement){
  const titleColor=gridTitleColor(accent);
  // Reseller mark on top, never hardcoded or duplicated over the fixtures.
  if(brand)contain(ctx,brand,385,39,310,81);
  ctx.save();ctx.shadowColor="rgba(3,8,25,.62)";ctx.shadowBlur=14;
  ctx.textBaseline="middle";ctx.font="italic 1000 71px Arial,Helvetica,sans-serif";
  ctx.fillStyle=titleColor;ctx.textAlign="right";ctx.fillText("JOGOS",551,163);
  ctx.fillStyle="#ffffff";ctx.textAlign="left";ctx.fillText("DO DIA",560,163);
  ctx.restore();
  ctx.save();
  ctx.fillStyle="#ffffff";
  ctx.beginPath();ctx.moveTo(258,212);ctx.lineTo(837,210);
  ctx.lineTo(822,272);ctx.lineTo(272,275);ctx.closePath();ctx.fill();
  ctx.restore();
  fitText(ctx,stampDate(day),548,241,505,26,17,"center","#112440",1000);
  ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=15;
  ctx.fillStyle=accent;rounded(ctx,42,298,996,5,2);ctx.fill();ctx.restore();

  const left=43,gapX=18,cardWidth=488;
  const {cardHeight,gapY,rowTop,badgeSize,badgeOffset}=gridCardGeometry(rows.length);
  if(rows.length>10)throw new Error("O Modelo 2 permite até 10 jogos por arte, mantendo o layout fixo.");
  for(let i=0;i<rows.length;i++){
    const row=Math.floor(i/2),col=i%2,m=rows[i];
    // Last unmatched game stays LEFT, as in the approved 9-game screenshot.
    const x=left+col*(cardWidth+gapX);
    const y=rowTop+row*(cardHeight+gapY);
    const cx=x+cardWidth/2;
    ctx.save();ctx.shadowColor="rgba(0,0,0,.30)";ctx.shadowBlur=10;ctx.shadowOffsetY=4;
    ctx.fillStyle="#ffffff";rounded(ctx,x,y,cardWidth,cardHeight,23);ctx.fill();ctx.restore();
    const background=ctx.createLinearGradient(0,y,0,y+cardHeight);
    background.addColorStop(0,"#fff");background.addColorStop(.8,"#f6f9ff");
    background.addColorStop(1,"#f1f6ff");
    ctx.save();rounded(ctx,x,y,cardWidth,cardHeight,23);ctx.clip();
    ctx.fillStyle=background;ctx.fillRect(x,y,cardWidth,cardHeight);ctx.restore();
    ctx.strokeStyle=accent;ctx.lineWidth=3;rounded(ctx,x+1.5,y+1.5,cardWidth-3,cardHeight-3,23);ctx.stroke();
    // Both team names are shown in full, in Brazilian Portuguese.
    const title=footballTeamNamePtBR(m.home)+" × "+footballTeamNamePtBR(m.away);
    fitText(ctx,title,cx,y+19,cardWidth-22,21,11,"center","#132342",950);
    fitText(ctx,(m.league||"FUTEBOL").toUpperCase(),cx,y+39,cardWidth-32,12,9,"center","#58749d",850);
    // Larger matched emblems, with transparent padding removed when present.
    // Leave the centre of the card clear for the kickoff time & broadcaster.
    // Use a common vertical CENTER rather than a shared image top.
    // Teams with asymmetric transparent padding are trimmed and re-centered.
    // The old .62 multiplier left circles tiny on the two-column layout.
    // Fit team emblems into nearly the entire side zones, without ever
    // intruding into the central kickoff/channel column.
    const badgeTop=y+badgeOffset;
    const homeX=x+15,awayX=x+cardWidth-badgeSize-15;
    ctx.save();ctx.shadowColor="rgba(15,40,90,.16)";
    ctx.shadowBlur=7;ctx.shadowOffsetY=1;
    if(badges[i*2])containGridBadge(ctx,badges[i*2]!,homeX,badgeTop,badgeSize,exportCanvas);
    else paintFallbackBadge(ctx,homeX,badgeTop,m.home,m.league,badgeSize);
    if(badges[i*2+1])containGridBadge(ctx,badges[i*2+1]!,awayX,badgeTop,badgeSize,exportCanvas);
    else paintFallbackBadge(ctx,awayX,badgeTop,m.away,m.league,badgeSize);
    ctx.restore();
    const clock=/^\d{2}:\d{2}$/.test(m.time||"")?(m.time||"").replace(":","H"):"A CONFIRMAR";
    const clockW=clock==="A CONFIRMAR"?175:150;
    const top=y+Math.max(54,Math.round(cardHeight*.41));
    const gradient=ctx.createLinearGradient(cx-clockW/2,0,cx+clockW/2,0);
    gradient.addColorStop(0,"#092d64");gradient.addColorStop(.95,accent);
    ctx.fillStyle=gradient;rounded(ctx,cx-clockW/2,top,clockW,41,14);ctx.fill();
    fitText(ctx,clock,cx,top+21,clockW-10,29,16,"center","#ffffff",950);
    gridBroadcast(ctx,m.broadcasts||[],cx,y+cardHeight-18,234);
  }
}
/** Native full-resolution artwork, never scaled from a mobile screenshot. */
export async function drawFootballPngFallback(data:FootballCanvasData):Promise<File>{
  if(typeof document!=="undefined"&&document.fonts?.ready)await document.fonts.ready;
  const canvas=document.createElement("canvas");
  canvas.width=FOOTBALL_PNG_WIDTH;
  canvas.height=FOOTBALL_PNG_HEIGHT;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Canvas indisponível para renderizar o banner em alta resolução.");
  ctx.scale(SCALE,SCALE);
  const {matches,day,accent,logo,contact,filename,playerPhoto}=data;
  const kind=data.kind||"today";
  let rows=matches.slice(0,kind==="finished"?1:kind==="grid"?10:4);
  if(rows.length===0)throw new Error("Nenhum confronto encontrado para gerar a arte.");
  const finalScore=kind==="finished"&&isVerifiedFinishedFootballMatch(rows[0])
    ?parseFootballFinalScore(rows[0].scoreLabel):null;
  if(kind==="finished"&&!finalScore)
    throw new Error("O resultado ainda não foi confirmado pela fonte de jogos.");
  const [stadium,brand,player,...badges]=await Promise.all([
    loadImage("/assets/vitrine-futebol-estadio.webp","fundo do estádio"),
    loadImage(logo,"logo do revendedor"),
    loadImage(playerPhoto||"","foto opcional do jogador",!!playerPhoto),
    ...rows.flatMap(m=>[
      loadTeamBadge(m.homeBadge||"",m.home,m.league),
      loadTeamBadge(m.awayBadge||"",m.away,m.league)
    ])
  ]);
  // A missing or blocked official image is not a reason to omit an actual
  // fixture. Both classic and 2-column layouts already paint a neutral badge
  // with team initials if loadTeamBadge returns null. This is visibly NOT an
  // official shield and preserves the real teams, dates and card dimensions.
  // RESTORED: the original user-approved "EVENTOS DE HOJE" sports poster
  // design. Native logical 1080×1350, rendered sharply at 2160×2700.
  // Keep the approved classic cards and typography, but share the exact same
  // color-reactive stadium as Modelo 2. Fim de Jogo retains its own backdrop.
  if(kind==="today"||kind==="grid"){
    drawAdaptiveGridBackdrop(ctx,stadium,accent);
  }else{
    const bg=ctx.createRadialGradient(905,350,20,480,650,1160);
    bg.addColorStop(0,accent);bg.addColorStop(.45,"#092451");bg.addColorStop(1,"#040e22");
    ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
    if(stadium){
      ctx.save();ctx.globalAlpha=.95;
      const tint=footballBackgroundStyle(accent);
      ctx.filter="hue-rotate("+tint.rotate+"deg) saturate("+tint.saturation+")";
      cover(ctx,stadium,0,0,1080,1350);ctx.restore();
    }
    const shade=ctx.createLinearGradient(0,0,0,1350);
    shade.addColorStop(0,"rgba(2,7,22,.50)");
    shade.addColorStop(.36,"rgba(2,7,22,.30)");
    shade.addColorStop(.73,"rgba(4,13,36,.39)");
    shade.addColorStop(1,"rgba(2,6,18,.66)");
    ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);
    const glow=ctx.createRadialGradient(850,380,12,770,410,650);
    glow.addColorStop(0,accent+"22");glow.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=glow;ctx.fillRect(0,0,1080,1350);
  }
  if(kind!=="grid"&&player){
    ctx.save();ctx.globalAlpha=.40;contain(ctx,player,615,275,460,850);ctx.restore();
  }

  if(kind!=="grid"){
  // Original composition: logo upper-left; italic yellow/white two-line title.
  if(brand)contain(ctx,brand,52,83,332,155);
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=10;
  ctx.fillStyle="#ffcf3e";ctx.textAlign="left";ctx.textBaseline="middle";
  ctx.font="italic 1000 77px Arial,Helvetica,sans-serif";
  ctx.fillText(kind==="finished"?"FIM DE":"EVENTOS",430,118);
  ctx.fillStyle="#ffffff";
  ctx.font="italic 1000 61px Arial,Helvetica,sans-serif";
  ctx.fillText(kind==="finished"?"JOGO":"DE HOJE",430,184);
  ctx.restore();
  // Slightly torn and angled date strip, rather than a plain square label.
  ctx.save();ctx.fillStyle="#fffafa";
  ctx.beginPath();ctx.moveTo(435,221);ctx.lineTo(908,218);
  ctx.lineTo(928,268);ctx.lineTo(438,272);ctx.lineTo(427,226);
  ctx.closePath();ctx.fill();ctx.restore();
  fitText(ctx,stampDate(day),680,246,440,21,16,"center","#101116",1000);
  ctx.save();ctx.shadowColor="rgba(167,218,255,.65)";ctx.shadowBlur=13;
  ctx.fillStyle=accent;rounded(ctx,48,342,981,5,3);ctx.fill();ctx.restore();

  }
  if(kind==="grid"){
    drawTwoColumnGrid(ctx,rows,badges,accent,day,brand,canvas);
  }else if(kind==="finished"&&finalScore){
    drawFinalScoreboard(ctx,rows[0],badges[0]||null,badges[1]||null,
      accent,finalScore.home,finalScore.away);
  }else{
  // Compact, curved fixture ribbons reproduce the APPROVED layout.
  const {cardHeight:rowHeight,gap,rowTop,badgeSize:flagSize,badgeOffset}=classicCardGeometry(rows.length);
  const cardLeft=48, cardWidth=984;
  for(let i=0;i<rows.length;i++){
    const m=rows[i], y=rowTop+i*(rowHeight+gap);
    ctx.save();ctx.shadowColor="rgba(0,0,0,.30)";
    ctx.shadowBlur=20;ctx.shadowOffsetY=7;
    ctx.fillStyle="#ffffff";rounded(ctx,cardLeft,y,cardWidth,rowHeight,23);ctx.fill();
    ctx.restore();
    ctx.save();rounded(ctx,cardLeft,y,cardWidth,rowHeight,23);ctx.clip();
    const panel=ctx.createLinearGradient(0,y,0,y+rowHeight);
    panel.addColorStop(0,"#ffffff");panel.addColorStop(.68,"#f4f7ff");panel.addColorStop(1,"#fff");
    ctx.fillStyle=panel;ctx.fillRect(cardLeft,y,cardWidth,rowHeight);
    ctx.restore();
    ctx.save();ctx.strokeStyle=accent;ctx.lineWidth=3;
    rounded(ctx,cardLeft+1,y+1,cardWidth-2,rowHeight-2,23);ctx.stroke();ctx.restore();

    const league=String(m.league||"FUTEBOL").toUpperCase();
    fitText(ctx,league,540,y+15,875,12,10,"center","#607087",900);
    // True circular flag/club crests: NO white ring, blue circles or 'K/PG'.
    const badgeY=y+badgeOffset,leftBadge=73,rightBadge=1031-flagSize-24;
    const midY=badgeY+flagSize/2;
    ctx.save();ctx.shadowColor="rgba(0,0,0,.18)";ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(badges[i*2])contain(ctx,badges[i*2]!,leftBadge,badgeY,flagSize,flagSize);
    else paintFallbackBadge(ctx,leftBadge,badgeY,m.home,m.league,flagSize);
    if(badges[i*2+1])contain(ctx,badges[i*2+1]!,rightBadge,badgeY,flagSize,flagSize);
    else paintFallbackBadge(ctx,rightBadge,badgeY,m.away,m.league,flagSize);
    ctx.restore();
    fitTwoLines(ctx,footballTeamNamePtBR(m.home),leftBadge+flagSize+14,midY,316,"left");
    fitTwoLines(ctx,footballTeamNamePtBR(m.away),rightBadge-14,midY,316,"right");
    textLine(ctx,"X",540,midY,21,accent,"center",1000);

    const ribbonHeight=38, ribbonY=y+rowHeight-ribbonHeight;
    ctx.save();rounded(ctx,51,ribbonY,978,ribbonHeight,13);ctx.clip();
    ctx.fillStyle="#f1f5fa";ctx.fillRect(51,ribbonY,978*.62,ribbonHeight);
    const timeGradient=ctx.createLinearGradient(650,0,1030,0);
    timeGradient.addColorStop(0,"#063b84");timeGradient.addColorStop(.92,accent);
    ctx.fillStyle=timeGradient;ctx.fillRect(51+978*.62,ribbonY,978*.38,ribbonHeight);
    ctx.restore();
    channels(ctx,m.broadcasts||[],ribbonY+ribbonHeight/2);
    const clock=/^\d{2}:\d{2}$/.test(m.time||"")?m.time:"Horário indisponível";
    fitText(ctx,clock,849,ribbonY+ribbonHeight/2,322,23,16,"center","#ffffff",1000);
  }

  }
  // The original compact green WhatsApp strip AND a separate discreet footer
  // brand mark. Two deliberate placements, not repeated overlapping logos.
  const phone=formatBrazilianWhatsApp(contact);
  if(phone){
    ctx.save();ctx.shadowColor="rgba(0,0,0,.46)";ctx.shadowBlur=21;ctx.shadowOffsetY=8;
    const strip=ctx.createLinearGradient(54,0,464,0);
    strip.addColorStop(0,"#071f29");strip.addColorStop(.6,"#0b3440");
    strip.addColorStop(1,"#10483d");
    ctx.fillStyle=strip;rounded(ctx,54,1187,410,76,22);ctx.fill();ctx.restore();
    ctx.strokeStyle="#30e796";ctx.lineWidth=2;
    rounded(ctx,54,1187,410,76,22);ctx.stroke();
    whatsappIcon(ctx,73,1201);
    textLine(ctx,"FALE PELO WHATSAPP",138,1213,13,"#71edb1","left",900);
    fitText(ctx,phone,138,1241,300,28,21,"left","#ffffff",1000);
  }
  if(kind==="grid"){
    // Footer follows the Stream Monitor identity, but is not a second logo.
    const x=580,y=1187,w=455,h=76;
    const footer=ctx.createLinearGradient(x,0,x+w,0);
    footer.addColorStop(0,"#0a2650");footer.addColorStop(1,accent);
    ctx.fillStyle=footer;rounded(ctx,x,y,w,h,20);ctx.fill();
    ctx.strokeStyle=gridTitleColor(accent);ctx.lineWidth=2;
    rounded(ctx,x,y,w,h,20);ctx.stroke();
    textLine(ctx,"ASSISTA EM",x+w/2,y+27,19,"#ffffff","center",900);
    textLine(ctx,"QUALQUER DISPOSITIVO",x+w/2,y+53,18,"#ffffff","center",900);
  }else if(brand)contain(ctx,brand,817,1188,210,76);
  // White torn-paper top and bottom borders are applied LAST, as in the CSS.
  torn(ctx);
  const blob=await new Promise<Blob>((resolve,reject)=>
    canvas.toBlob(b=>b?resolve(b):reject(new Error("Canvas não gerou PNG.")),"image/png"));
  if(blob.size<1000)throw new Error("A imagem final está vazia.");
  await validatedPng(blob);
  canvas.width=canvas.height=0; // release ~24 MB on Safari
  return new File([blob],filename,{type:"image/png"});
}
