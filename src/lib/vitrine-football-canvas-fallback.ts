import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { formatBrazilianWhatsApp } from "@/lib/vitrine-football-phone";
import { footballBackgroundStyle } from "@/lib/vitrine-football-color";

type ExportData={
  matches:FootballMatch[];day:string;accent:string;logo:string;contact:string;
  name:string;filename:string;playerPhoto?:string;
};
const SIZE=1080;
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const rad=Math.min(r,w/2,h/2);
  ctx.beginPath();ctx.moveTo(x+rad,y);
  ctx.arcTo(x+w,y,x+w,y+h,rad);
  ctx.arcTo(x+w,y+h,x,y+h,rad);
  ctx.arcTo(x,y+h,x,y,rad);
  ctx.arcTo(x,y,x+w,y,rad);ctx.closePath();
}
async function loadImage(src:string):Promise<HTMLImageElement|null>{
  if(!src)return null;
  const image=new Image();
  image.decoding="async";
  if(/^https?:/i.test(src))image.crossOrigin="anonymous";
  try{
    await Promise.race([
      new Promise<void>((resolve,reject)=>{
        image.onload=()=>resolve();
        image.onerror=()=>reject(new Error("Imagem não carregou"));
        image.src=src;
      }),
      new Promise<void>((_,reject)=>setTimeout(()=>reject(new Error("Imagem expirou")),6500))
    ]);
    return image.naturalWidth>0?image:null;
  }catch{return null;}
}
function contain(ctx:CanvasRenderingContext2D,image:HTMLImageElement,
 x:number,y:number,w:number,h:number){
  const ratio=Math.min(w/image.naturalWidth,h/image.naturalHeight);
  const rw=image.naturalWidth*ratio,rh=image.naturalHeight*ratio;
  ctx.drawImage(image,x+(w-rw)/2,y+(h-rh)/2,rw,rh);
}
function fitText(ctx:CanvasRenderingContext2D,text:string,maxWidth:number,
  size:number,min:number,x:number,y:number,align:CanvasTextAlign="left",
  weight=900,color="#18233c"){
  ctx.save();ctx.textAlign=align;ctx.textBaseline="middle";ctx.fillStyle=color;
  let font=size;
  while(font>min){
    ctx.font=weight+" "+font+"px Arial, sans-serif";
    if(ctx.measureText(text).width<=maxWidth)break;
    font-=1;
  }
  ctx.font=weight+" "+font+"px Arial, sans-serif";
  if(ctx.measureText(text).width>maxWidth){
    while(text.length>1&&ctx.measureText(text+"…").width>maxWidth)text=text.slice(0,-1);
    text+="…";
  }
  ctx.fillText(text,x,y);
  ctx.restore();
}
function stampDate(day:string){
 const date=new Date(day+"T12:00:00-03:00");
 if(!Number.isFinite(date.getTime()))return day;
 return new Intl.DateTimeFormat("pt-BR",{
  timeZone:"America/Fortaleza",weekday:"long",day:"2-digit",month:"long",
 }).format(date).replace("-feira","").toUpperCase();
}
function drawWhatsApp(ctx:CanvasRenderingContext2D,x:number,y:number){
  ctx.save();
  ctx.fillStyle="#11b96d";rounded(ctx,x,y,48,48,13);ctx.fill();
  const path="M16 3C8.82 3 3 8.78 3 15.94c0 2.28.6 4.5 1.72 6.47L3 29l6.77-1.77a13.06 13.06 0 0 0 6.23 1.57c7.18 0 13-5.79 13-12.94S23.18 3 16 3Zm0 23.44c-1.94 0-3.84-.52-5.49-1.5l-.39-.23-4.02 1.05 1.07-3.9-.25-.4a10.47 10.47 0 0 1-1.6-5.52c0-5.84 4.8-10.59 10.7-10.59 5.9 0 10.7 4.75 10.7 10.59S21.9 26.44 16 26.44Zm5.88-7.94c-.32-.16-1.88-.92-2.18-1.02-.29-.11-.5-.16-.71.16-.21.32-.82 1.02-1.22.18-.21-.37-.24-.69-.08-.32.16-1.35.49-2.58-1.57-.95-.84-1.59-1.87-1.77-2.19-.18-.31-.02-.48.14-.64.15-.14.32-.37.48-.55.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.71-.97-2.34-.26-.61-.52-.52-.72-.53h-.61c-.21 0-.55.08-.84.4-.29.32-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.23 3.39 5.41 4.75.76.32 1.35.52 1.81.66.76.24 1.46.2 2.01.12.61-.09 1.88-.77 2.14-1.52.26-.75.26-1.39.18-1.53-.08-.13-.29-.21-.61-.37Z";
  try{
    ctx.translate(x+4,y+4);ctx.scale(1.25,1.25);
    ctx.fillStyle="#fff";ctx.fill(new Path2D(path));
  }catch{
    ctx.fillStyle="#fff";ctx.font="bold 27px Arial,sans-serif";
    ctx.fillText("☎",x+10,y+32);
  }
  ctx.restore();
}
function drawTornEdges(ctx:CanvasRenderingContext2D){
  ctx.fillStyle="#f8f8f7";
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(SIZE,0);
  for(let x=SIZE;x>=0;x-=36)ctx.lineTo(x,22+(Math.round(x/36)%2?9:0));
  ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(0,SIZE);ctx.lineTo(SIZE,SIZE);
  for(let x=SIZE;x>=0;x-=36)ctx.lineTo(x,SIZE-27+(Math.round(x/36)%2?10:-3));
  ctx.closePath();ctx.fill();
}
/**
 * Safari/WebKit-safe native Canvas rendering: never crop/scale a DOM preview.
 * Mirrors the four full-width cards, background, flags, watermark, contact
 * and reseller logo of FootballSchedulePoster on a true 1080×1080 canvas.
 * All externally hosted badge/logo sources should be inlined by the caller.
 */
export async function drawFootballPngFallback(data:ExportData):Promise<File>{
  const canvas=document.createElement("canvas");
  canvas.width=SIZE;canvas.height=SIZE;
  const ctx=canvas.getContext("2d",{alpha:false});
  if(!ctx)throw new Error("Seu navegador não disponibilizou Canvas para gerar PNG.");
  const {day,matches,accent,logo,contact,filename,playerPhoto}=data;
  const [stadium,brandLogo,player,...badges]=await Promise.all([
    loadImage("/assets/vitrine-futebol-estadio.webp"),
    loadImage(logo),loadImage(playerPhoto||""),
    ...matches.slice(0,4).flatMap(m=>[
      loadImage(m.homeBadge||""),loadImage(m.awayBadge||"")
    ]),
  ]);
  // Background image and the current reseller's selected color.
  const gradient=ctx.createLinearGradient(0,0,SIZE,SIZE);
  gradient.addColorStop(0,"#061222");gradient.addColorStop(.55,accent);
  gradient.addColorStop(1,"#050d1b");
  ctx.fillStyle=gradient;ctx.fillRect(0,0,SIZE,SIZE);
  if(stadium){
    ctx.save();
    const tint=footballBackgroundStyle(accent);
    if("filter" in ctx)ctx.filter="hue-rotate("+tint.rotate+"deg) saturate("+tint.saturation+")";
    const scale=Math.max(SIZE/stadium.naturalWidth,SIZE/stadium.naturalHeight);
    ctx.globalAlpha=.92;
    ctx.drawImage(stadium,(SIZE-stadium.naturalWidth*scale)/2,
      (SIZE-stadium.naturalHeight*scale)/2,
      stadium.naturalWidth*scale,stadium.naturalHeight*scale);
    ctx.restore();
  }
  ctx.fillStyle="rgba(2,8,25,.50)";ctx.fillRect(0,0,SIZE,SIZE);
  const light=ctx.createRadialGradient(850,225,10,850,225,900);
  light.addColorStop(0,accent+"55");light.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=light;ctx.fillRect(0,0,SIZE,SIZE);
  if(brandLogo){
    ctx.save();ctx.globalAlpha=.08;
    contain(ctx,brandLogo,105,330,870,590);
    ctx.restore();
  }
  if(player){
    ctx.save();ctx.globalAlpha=.52;
    contain(ctx,player,580,150,540,820);ctx.restore();
  }
  drawTornEdges(ctx);
  // Header logo and branded title.
  if(brandLogo)contain(ctx,brandLogo,45,69,350,163);
  fitText(ctx,"EVENTOS",600,72,58,430,116,"left",1000,"#ffcf3e");
  fitText(ctx,"DE HOJE",530,57,49,430,179,"left",1000,"#fff");
  ctx.fillStyle="#fff";rounded(ctx,427,214,407,45,4);ctx.fill();
  fitText(ctx,stampDate(day),380,19,15,448,237,"left",1000,"#14161d");
  ctx.fillStyle=accent;rounded(ctx,48,301,978,6,2);ctx.fill();
  // Uniform rows: the same 4 games and data used by the UI, independent of
  // whether a match has already ended.
  const rows=matches.slice(0,4);
  const rowHeight=rows.length===1?210:135;
  const gap=14,cardLeft=48,cardWidth=984;
  for(let i=0;i<rows.length;i++){
    const match=rows[i],y=320+i*(rowHeight+gap);
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,.28)";ctx.shadowBlur=17;ctx.shadowOffsetY=8;
    ctx.fillStyle="#fff";rounded(ctx,cardLeft,y,cardWidth,rowHeight,23);ctx.fill();
    ctx.restore();
    ctx.strokeStyle=accent;ctx.lineWidth=3;
    rounded(ctx,cardLeft,y,cardWidth,rowHeight,23);ctx.stroke();
    ctx.fillStyle="#f5f7ff";
    rounded(ctx,51,y+3,978,rowHeight*.62,21);ctx.fill();
    fitText(ctx,(match.league||"FUTEBOL").toUpperCase(),860,
      12,11,540,y+17,"center",1000,"#5c6880");
    const home=badges[i*2],away=badges[i*2+1];
    const h=49;
    if(home)contain(ctx,home,67,y+37,h,h);
    if(away)contain(ctx,away,966,y+37,h,h);
    // Make sure all team text stays inside the card, and don't cover the crests.
    fitText(ctx,match.home,360,23,16,home?133:75,y+74,"left",950,"#17223b");
    fitText(ctx,match.away,360,23,16,away?949:1005,y+74,"right",950,"#17223b");
    fitText(ctx,"X",40,21,19,540,y+74,"center",1000,accent);
    const ribbonHeight=rows.length===1?51:37;
    const ry=y+rowHeight-ribbonHeight;
    ctx.save();rounded(ctx,51,ry,978,ribbonHeight,10);ctx.clip();
    ctx.fillStyle="#f1f5fa";ctx.fillRect(51,ry,978*.62,ribbonHeight);
    const timeGradient=ctx.createLinearGradient(662,0,1030,0);
    timeGradient.addColorStop(0,accent);
    timeGradient.addColorStop(1,accent);
    ctx.fillStyle=timeGradient;ctx.fillRect(51+978*.62,ry,978*.38,ribbonHeight);
    ctx.restore();
    const broadcast=(match.broadcasts||[]).slice(0,3).join(" • ")||"Sem transmissão";
    fitText(ctx,broadcast,555,rows.length===1?18:14,12,355,
      ry+ribbonHeight/2,"center",900,"#263349");
    const clock=/^\d{2}:\d{2}$/.test(match.time||"")?
      match.time:"Horário indisponível";
    fitText(ctx,clock,332,rows.length===1?29:23,18,843,
      ry+ribbonHeight/2,"center",1000,"#fff");
  }
  const phone=formatBrazilianWhatsApp(contact);
  if(phone){
    ctx.save();ctx.shadowColor="rgba(0,0,0,.55)";ctx.shadowBlur=20;ctx.shadowOffsetY=8;
    const bg=ctx.createLinearGradient(54,950,464,950);
    bg.addColorStop(0,"#071f29");bg.addColorStop(1,"#10483d");
    ctx.fillStyle=bg;rounded(ctx,54,956,410,76,22);ctx.fill();ctx.restore();
    ctx.strokeStyle="#30e796";ctx.lineWidth=2;
    rounded(ctx,54,956,410,76,22);ctx.stroke();
    drawWhatsApp(ctx,73,970);
    fitText(ctx,"FALE PELO WHATSAPP",314,13,11,133,977,
      "left",900,"#71edb1");
    fitText(ctx,phone,315,28,22,133,1006,"left",1000,"#fff");
  }
  if(brandLogo){
    contain(ctx,brandLogo,685,953,350,82);
  }
  const blob=await new Promise<Blob>((resolve,reject)=>
    canvas.toBlob(value=>value?resolve(value):reject(new Error("PNG Canvas indisponível")),
      "image/png")
  );
  if(blob.size<1000)throw new Error("O PNG não pôde ser gerado completamente.");
  return new File([blob],filename,{type:"image/png"});
}
