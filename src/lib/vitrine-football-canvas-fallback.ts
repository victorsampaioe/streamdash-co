import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { formatBrazilianWhatsApp } from "@/lib/vitrine-football-phone";
import { footballBackgroundStyle } from "@/lib/vitrine-football-color";
import { footballTeamNamePtBR, nationalTeamFlagEmoji } from "@/lib/vitrine-football-ptbr";

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
  let font=27,lines:string[]=[];
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
  const dy=lines.length===1?0:15;
  lines.forEach((line,i)=>textLine(ctx,line,x,y-dy+i*30,font,"#17223b",align,950));
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
    .filter(Boolean).slice(0,2).map(word=>word[0]||"").join("").toUpperCase();
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
  ctx.fillStyle="#fff";setFont(ctx,28,900);ctx.textAlign="center";
  ctx.textBaseline="middle";ctx.fillText("☎",x+24,y+24);ctx.restore();
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
      loadImage(m.homeBadge||"","escudo ou bandeira de "+footballTeamNamePtBR(m.home),false),
      loadImage(m.awayBadge||"","escudo ou bandeira de "+footballTeamNamePtBR(m.away),false)
    ])
  ]);
  const bg=ctx.createLinearGradient(0,0,1080,1350);
  bg.addColorStop(0,"#04152b");bg.addColorStop(.55,accent);bg.addColorStop(1,"#050e20");
  ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
  if(stadium){
    ctx.save();ctx.globalAlpha=.95;
    const tint=footballBackgroundStyle(accent);
    ctx.filter="hue-rotate("+tint.rotate+"deg) saturate("+tint.saturation+")";
    cover(ctx,stadium,0,0,1080,1350);ctx.restore();
  }
  const shade=ctx.createLinearGradient(0,0,0,1350);
  shade.addColorStop(0,"rgba(3,11,30,.63)");shade.addColorStop(.5,"rgba(4,11,29,.30)");
  shade.addColorStop(1,"rgba(3,12,25,.70)");
  ctx.fillStyle=shade;ctx.fillRect(0,0,1080,1350);
  if(player){
    ctx.save();ctx.globalAlpha=.35;contain(ctx,player,650,315,460,830);ctx.restore();
  }
  // Clean single brand mark, deliberately no watermark or duplicate footer logo.
  if(brand)contain(ctx,brand,54,82,300,165);
  ctx.save();ctx.shadowColor="#0009";ctx.shadowBlur=10;
  textLine(ctx,"EVENTOS",425,121,72,"#ffcf3e","left",1000);
  textLine(ctx,"DE HOJE",425,183,54,"#fff","left",1000);ctx.restore();
  ctx.fillStyle="#fff";rounded(ctx,425,216,565,46,6);ctx.fill();
  fitText(ctx,stampDate(day),706,239,515,22,16,"center","#101116",1000);
  ctx.fillStyle=accent;rounded(ctx,48,335,984,6,3);ctx.fill();
  const rowHeight=rows.length===1?240:rows.length===2?226:rows.length===3?205:186;
  const gap=18;
  for(let i=0;i<rows.length;i++){
    const m=rows[i],y=357+i*(rowHeight+gap);
    ctx.save();ctx.shadowColor="#0008";ctx.shadowBlur=16;ctx.shadowOffsetY=8;
    ctx.fillStyle="#fff";rounded(ctx,48,y,984,rowHeight,25);ctx.fill();ctx.restore();
    ctx.strokeStyle=accent;ctx.lineWidth=3;rounded(ctx,48,y,984,rowHeight,25);ctx.stroke();
    ctx.fillStyle="#f4f7ff";rounded(ctx,52,y+3,976,rowHeight-51,21);ctx.fill();
    const league=String(m.league||"FUTEBOL").toUpperCase();
    fitText(ctx,league,540,y+19,900,14,11,"center","#64738b",800);
    if(badges[i*2])contain(ctx,badges[i*2]!,72,y+54,62,62);
    else paintFallbackBadge(ctx,72,y+54,m.home,m.league);
    if(badges[i*2+1])contain(ctx,badges[i*2+1]!,945,y+54,62,62);
    else paintFallbackBadge(ctx,945,y+54,m.away,m.league);
    fitTwoLines(ctx,footballTeamNamePtBR(m.home),146,y+87,310,"left");
    fitTwoLines(ctx,footballTeamNamePtBR(m.away),929,y+87,310,"right");
    textLine(ctx,"X",540,y+87,26,accent,"center",1000);
    const ribbonY=y+rowHeight-49;
    ctx.save();rounded(ctx,51,ribbonY,978,46,8);ctx.clip();
    ctx.fillStyle="#f0f4fb";ctx.fillRect(51,ribbonY,625,46);
    const stripe=ctx.createLinearGradient(675,0,1030,0);
    stripe.addColorStop(0,accent);stripe.addColorStop(1,accent);
    ctx.fillStyle=stripe;ctx.fillRect(675,ribbonY,355,46);
    ctx.restore();
    channels(ctx,m.broadcasts||[],ribbonY+23);
    const time=/^\d{2}:\d{2}$/.test(m.time||"")?m.time:"Horário indisponível";
    fitText(ctx,time,850,ribbonY+23,300,25,15,"center","#fff",1000);
  }
  const phone=formatBrazilianWhatsApp(contact);
  if(phone){
    ctx.save();ctx.shadowColor="#0008";ctx.shadowBlur=17;ctx.shadowOffsetY=9;
    const strip=ctx.createLinearGradient(55,0,545,0);
    strip.addColorStop(0,"#071f29");strip.addColorStop(1,"#10483d");
    ctx.fillStyle=strip;rounded(ctx,54,1212,525,78,19);ctx.fill();ctx.restore();
    ctx.strokeStyle="#30e796";ctx.lineWidth=2;
    rounded(ctx,54,1212,525,78,19);ctx.stroke();
    whatsappIcon(ctx,70,1226);
    textLine(ctx,"FALE PELO WHATSAPP",139,1236,16,"#71edb1","left",900);
    fitText(ctx,phone,139,1267,414,32,24,"left","#fff",1000);
  }
  torn(ctx);
  const blob=await new Promise<Blob>((resolve,reject)=>
    canvas.toBlob(b=>b?resolve(b):reject(new Error("Canvas não gerou PNG.")),"image/png"));
  if(blob.size<1000)throw new Error("A imagem final está vazia.");
  await validatedPng(blob);
  canvas.width=canvas.height=0; // release ~24 MB on Safari
  return new File([blob],filename,{type:"image/png"});
}
