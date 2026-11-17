import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { formatBrazilianWhatsApp } from "@/lib/vitrine-football-phone";
import { footballBackgroundStyle } from "@/lib/vitrine-football-color";

type ExportData={
  matches:FootballMatch[];day:string;accent:string;logo:string;contact:string;
  name:string;filename:string;
};
const SIZE=1080;
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  const rad=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+rad,y);ctx.arcTo(x+w,y,x+w,y+h,rad);
  ctx.arcTo(x+w,y+h,x,y+h,rad);
  ctx.arcTo(x,y+h,x,y,rad);
  ctx.arcTo(x,y,x+w,y,rad);
  ctx.closePath();
}
async function imageForCanvas(src:string):Promise<HTMLImageElement|null>{
  if(!src)return null;
  const img=new Image();
  if(/^https?:/i.test(src))img.crossOrigin="anonymous";
  img.decoding="async";
  try{
    await Promise.race([
      new Promise<void>((resolve,reject)=>{
        img.onload=()=>resolve();img.onerror=()=>reject(new Error("image unavailable"));
        img.src=src;
      }),
      new Promise<void>((_,reject)=>setTimeout(()=>reject(new Error("image timeout")),3500))
    ]);
    return img.naturalWidth>0?img:null;
  }catch{return null;}
}
function imageContain(ctx:CanvasRenderingContext2D,img:HTMLImageElement,
 x:number,y:number,w:number,h:number){
  const ratio=Math.min(w/img.naturalWidth,h/img.naturalHeight);
  const iw=img.naturalWidth*ratio,ih=img.naturalHeight*ratio;
  ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
}
function fitText(ctx:CanvasRenderingContext2D,label:string,maxWidth:number,
 fontSize:number,minSize:number,x:number,y:number,align:CanvasTextAlign="left"){
  let font=fontSize;
  ctx.textAlign=align;
  ctx.textBaseline="middle";
  while(font>minSize){
    ctx.font="900 "+font+"px Arial, sans-serif";
    if(ctx.measureText(label).width<=maxWidth)break;
    font-=1;
  }
  ctx.font="900 "+font+"px Arial, sans-serif";
  if(ctx.measureText(label).width>maxWidth){
    while(label.length>1 && ctx.measureText(label+"…").width>maxWidth)label=label.slice(0,-1);
    label+="…";
  }
  ctx.fillText(label,x,y);
}
function dateText(date:string){
 const value=new Date(date+"T12:00:00-03:00");
 if(Number.isNaN(value.getTime()))return date;
 return new Intl.DateTimeFormat("pt-BR",{
  timeZone:"America/Fortaleza",weekday:"long",day:"2-digit",month:"long"
 }).format(value).replace("-feira","").toUpperCase();
}
function makeFile(blob:Blob,name:string){
 return new File([blob],name,{type:"image/png"});
}
/** Canvas exporter used only if html-to-image fails (notably Safari/WebKit).
 * Keeps full fixture text, hours, channels and brand without relying on SVG foreignObject.
 */
export async function drawFootballPngFallback(options:ExportData):Promise<File>{
 const canvas=document.createElement("canvas");
 canvas.width=SIZE;canvas.height=SIZE;
 const ctx=canvas.getContext("2d",{alpha:false});
 if(!ctx)throw new Error("Seu navegador não disponibilizou Canvas para gerar PNG.");
 const {matches,day,accent,logo,contact,filename}=options;
 const bg=ctx.createLinearGradient(0,0,SIZE,SIZE);
 bg.addColorStop(0,"#061020");bg.addColorStop(.55,"#123c77");bg.addColorStop(1,"#07182d");
 ctx.fillStyle=bg;ctx.fillRect(0,0,SIZE,SIZE);
 const [stadium,brandLogo,...crests]=await Promise.all([
  imageForCanvas("/assets/vitrine-futebol-estadio.webp"),
  imageForCanvas(logo),
  ...matches.slice(0,4).flatMap(match=>[
   imageForCanvas(match.homeBadge||""),imageForCanvas(match.awayBadge||"")
  ])
 ]);
 if(stadium){
  ctx.save();
  const tint=footballBackgroundStyle(accent);
  if("filter" in ctx)ctx.filter="hue-rotate("+tint.rotate+"deg) saturate("+tint.saturation+")";
  const scale=Math.max(SIZE/stadium.naturalWidth,SIZE/stadium.naturalHeight);
  ctx.drawImage(stadium,(SIZE-stadium.naturalWidth*scale)/2,
    (SIZE-stadium.naturalHeight*scale)/2,stadium.naturalWidth*scale,stadium.naturalHeight*scale);
  ctx.restore();
 }
 ctx.fillStyle="rgba(1,8,22,.52)";ctx.fillRect(0,0,SIZE,SIZE);
 // Light sweep, to preserve the stadium color chosen in the original preview.
 const glow=ctx.createRadialGradient(760,220,10,760,220,820);
 glow.addColorStop(0,accent+"70");glow.addColorStop(1,"transparent");
 ctx.fillStyle=glow;ctx.fillRect(0,0,SIZE,SIZE);
 // Top and bottom white accent.
 ctx.fillStyle="#ffffff";
 ctx.beginPath();
 ctx.moveTo(0,15);
 for(let x=0;x<=SIZE;x+=46)ctx.lineTo(x,17+(Math.floor(x/46)%2)*8);
 ctx.lineTo(SIZE,0);ctx.lineTo(0,0);ctx.closePath();ctx.fill();
 ctx.beginPath();ctx.moveTo(0,SIZE-20);
 for(let x=0;x<=SIZE;x+=46)ctx.lineTo(x,SIZE-17-(Math.floor(x/46)%2)*8);
 ctx.lineTo(SIZE,SIZE);ctx.lineTo(0,SIZE);ctx.closePath();ctx.fill();
 if(brandLogo){
  imageContain(ctx,brandLogo,66,66,245,130);
 }
 ctx.fillStyle="#ffcc43";
 ctx.textAlign="left";ctx.textBaseline="alphabetic";
 ctx.font="italic 900 63px Arial,sans-serif";
 ctx.fillText("EVENTOS",360,135);
 ctx.fillStyle="#fff";ctx.font="italic 900 63px Arial,sans-serif";
 ctx.fillText("DE HOJE",360,199);
 ctx.font="bold 22px Arial,sans-serif";
 const formattedDate=dateText(day);
 ctx.fillStyle="#fff";
 roundRect(ctx,354,220,350,42,8);ctx.fill();
 ctx.fillStyle="#071528";ctx.textAlign="center";ctx.textBaseline="middle";
 fitText(ctx,formattedDate,332,21,16,529,241,"center");
 ctx.fillStyle=accent;roundRect(ctx,58,299,964,5,2);ctx.fill();
 for(let i=0;i<Math.min(4,matches.length);i++){
  const match=matches[i],top=319+i*149;
  ctx.save();ctx.shadowColor="#0009";ctx.shadowBlur=14;ctx.shadowOffsetY=8;
  ctx.fillStyle="#fdfdff";roundRect(ctx,58,top,964,136,23);ctx.fill();
  ctx.restore();
  ctx.strokeStyle=accent;ctx.lineWidth=3;
  roundRect(ctx,58,top,964,136,23);ctx.stroke();
  ctx.fillStyle="#65718b";
  fitText(ctx,String(match.league||"FUTEBOL").toUpperCase(),670,16,12,540,top+18,"center");
  const homeImg=crests[i*2],awayImg=crests[i*2+1];
  if(homeImg)imageContain(ctx,homeImg,74,top+41,66,62);
  if(awayImg)imageContain(ctx,awayImg,936,top+41,66,62);
  ctx.fillStyle="#19233b";
  fitText(ctx,match.home,330,27,17,homeImg?151:87,top+77,"left");
  fitText(ctx,match.away,330,27,17,awayImg?925:993,top+77,"right");
  ctx.fillStyle=accent;fitText(ctx,"X",35,28,25,540,top+76,"center");
  ctx.save();roundRect(ctx,59,top+101,962,34,8);ctx.clip();
  ctx.fillStyle="#eef2fa";ctx.fillRect(60,top+101,621,34);
  ctx.fillStyle=accent;ctx.fillRect(681,top+101,339,34);
  ctx.restore();
  ctx.fillStyle="#2b364e";
  const broadcast=(match.broadcasts||[]).slice(0,3).join(" • ")||"Sem transmissão";
  fitText(ctx,broadcast,580,17,13,370,top+117,"center");
  ctx.fillStyle="#ffffff";
  const clock=/^\d{2}:\d{2}$/.test(match.time||"")?match.time:"Horário indisponível";
  fitText(ctx,clock,315,26,18,850,top+117,"center");
 }
 const phone=formatBrazilianWhatsApp(contact);
 if(phone){
  ctx.save();ctx.shadowColor="#0008";ctx.shadowBlur=6;
  ctx.fillStyle="#086d4f";roundRect(ctx,63,944,394,79,20);ctx.fill();
  ctx.restore();
  ctx.lineWidth=2;ctx.strokeStyle="#27d39b";
  roundRect(ctx,63,944,394,79,20);ctx.stroke();
  ctx.fillStyle="#c3ffdc";ctx.font="bold 15px Arial,sans-serif";
  ctx.textAlign="left";ctx.fillText("FALE PELO WHATSAPP",96,968);
  ctx.fillStyle="#fff";fitText(ctx,phone,345,28,21,96,994);
 }
 if(brandLogo){
  ctx.save();ctx.globalAlpha=.45;
  imageContain(ctx,brandLogo,867,947,145,75);
  ctx.restore();
 }
 const blob=await new Promise<Blob>((resolve,reject)=>{
  canvas.toBlob(value=>value?resolve(value):reject(new Error("PNG Canvas indisponível")),
   "image/png");
 });
 return makeFile(blob,filename);
}
