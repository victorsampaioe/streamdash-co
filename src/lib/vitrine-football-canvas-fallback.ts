import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { formatBrazilianWhatsApp } from "@/lib/vitrine-football-phone";
import { footballBackgroundStyle } from "@/lib/vitrine-football-color";
import { footballTeamNamePtBR, nationalTeamFlagEmoji, nationalTeamFlagFallback } from "@/lib/vitrine-football-ptbr";
import { offlineFootballFlag } from "@/lib/vitrine-football-offline-flags";

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
  name:string;filename:string;playerPhoto?:string;
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
  if(!labels.length)labels.push("Sem transmissão");
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
function validatedPng(blob:Blob):Promise<void>{
  return blob.slice(0,24).arrayBuffer().then(header=>{
    if(header.byteLength!==24)throw new Error("PNG inválido: cabeçalho incompleto.");
    const d=new DataView(header);
    if(d.getUint32(0)!==0x89504e47||d.getUint32(4)!==0x0d0a1a0a||
      d.getUint32(16)!==FOOTBALL_PNG_WIDTH||d.getUint32(20)!==FOOTBALL_PNG_HEIGHT)
      throw new Error("O PNG não tem os 2160 × 2700 pixels obrigatórios.");
  });
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
  const rows=matches.slice(0,4);
  if(rows.length===0)throw new Error("Nenhum confronto encontrado para gerar a arte.");
  const [stadium,brand,player,...badges]=await Promise.all([
    loadImage("/assets/vitrine-futebol-estadio.webp","fundo do estádio"),
    loadImage(logo,"logo do revendedor"),
    loadImage(playerPhoto||"","foto opcional do jogador",!!playerPhoto),
    ...rows.flatMap(m=>[
      loadTeamBadge(m.homeBadge||"",m.home,m.league),
      loadTeamBadge(m.awayBadge||"",m.away,m.league)
    ])
  ]);
  // RESTORED: the original user-approved "EVENTOS DE HOJE" sports poster
  // design. Native logical 1080×1350, rendered sharply at 2160×2700.
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
  // Blue glow echoes the stadium lighting of the original banner.
  const glow=ctx.createRadialGradient(850,380,12,770,410,650);
  glow.addColorStop(0,accent+"22");glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=glow;ctx.fillRect(0,0,1080,1350);
  if(player){
    ctx.save();ctx.globalAlpha=.40;contain(ctx,player,615,275,460,850);ctx.restore();
  }

  // Original composition: logo upper-left; italic yellow/white two-line title.
  if(brand)contain(ctx,brand,52,83,332,155);
  ctx.save();
  ctx.shadowColor="rgba(0,0,0,.35)";ctx.shadowBlur=10;
  ctx.fillStyle="#ffcf3e";ctx.textAlign="left";ctx.textBaseline="middle";
  ctx.font="italic 1000 77px Arial,Helvetica,sans-serif";
  ctx.fillText("EVENTOS",430,118);
  ctx.fillStyle="#ffffff";
  ctx.font="italic 1000 61px Arial,Helvetica,sans-serif";
  ctx.fillText("DE HOJE",430,184);
  ctx.restore();
  // Slightly torn and angled date strip, rather than a plain square label.
  ctx.save();ctx.fillStyle="#fffafa";
  ctx.beginPath();ctx.moveTo(435,221);ctx.lineTo(908,218);
  ctx.lineTo(928,268);ctx.lineTo(438,272);ctx.lineTo(427,226);
  ctx.closePath();ctx.fill();ctx.restore();
  fitText(ctx,stampDate(day),680,246,440,21,16,"center","#101116",1000);
  ctx.save();ctx.shadowColor="rgba(167,218,255,.65)";ctx.shadowBlur=13;
  ctx.fillStyle=accent;rounded(ctx,48,342,981,5,3);ctx.fill();ctx.restore();

  // Compact, curved fixture ribbons reproduce the APPROVED layout.
  const rowHeight=rows.length===1?205:153;
  const gap=18, cardLeft=48, cardWidth=984, rowTop=367;
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
    const flagSize=54, badgeY=y+48;
    ctx.save();ctx.shadowColor="rgba(0,0,0,.18)";ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(badges[i*2])contain(ctx,badges[i*2]!,73,badgeY,flagSize,flagSize);
    else paintFallbackBadge(ctx,73,badgeY,m.home,m.league,flagSize);
    if(badges[i*2+1])contain(ctx,badges[i*2+1]!,953,badgeY,flagSize,flagSize);
    else paintFallbackBadge(ctx,953,badgeY,m.away,m.league,flagSize);
    ctx.restore();
    fitTwoLines(ctx,footballTeamNamePtBR(m.home),141,y+75,326,"left");
    fitTwoLines(ctx,footballTeamNamePtBR(m.away),939,y+75,326,"right");
    textLine(ctx,"X",540,y+74,21,accent,"center",1000);

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
  if(brand)contain(ctx,brand,817,1188,210,76);
  // White torn-paper top and bottom borders are applied LAST, as in the CSS.
  torn(ctx);
  const blob=await new Promise<Blob>((resolve,reject)=>
    canvas.toBlob(b=>b?resolve(b):reject(new Error("Canvas não gerou PNG.")),"image/png"));
  if(blob.size<1000)throw new Error("A imagem final está vazia.");
  await validatedPng(blob);
  canvas.width=canvas.height=0; // release ~24 MB on Safari
  return new File([blob],filename,{type:"image/png"});
}
