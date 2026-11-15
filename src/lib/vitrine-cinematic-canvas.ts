export type CinematicFormat="portrait"|"square"|"story"|"landscape";
export type CinematicMode="banner"|"video";
export type CinematicOptions={
  mode:CinematicMode;
  width:number;
  height:number;
  title:string;
  overview:string;
  year:string;
  genre:string;
  classification:string;
  label:string;
  brand:string;
  whatsapp:string;
  color:string;
  logoPosition:"left"|"right";
  lighting:"natural"|"blue"|"warm";
  posterVisible:boolean;
  background:CanvasImageSource|null;
  backgroundIsPoster:boolean;
  poster:CanvasImageSource|null;
  logo:CanvasImageSource|null;
  video:HTMLVideoElement|null;
  /** Region captured from a user-shared browser tab, in source pixel coordinates. */
  videoCrop?:{sx:number;sy:number;sw:number;sh:number}|null;
};
export const cinematicFormats={
  portrait:{width:1080,height:1350,label:"Feed · 1080 × 1350"},
  square:{width:1080,height:1080,label:"Quadrado · 1080 × 1080"},
  story:{width:1080,height:1920,label:"Stories / Reels · 1080 × 1920"},
  landscape:{width:1920,height:1080,label:"Horizontal · 1920 × 1080"},
} as const;

function imageSize(image:CanvasImageSource){
  if(image instanceof HTMLVideoElement)return {width:image.videoWidth,height:image.videoHeight};
  if(image instanceof HTMLImageElement)return {width:image.naturalWidth,height:image.naturalHeight};
  if(image instanceof HTMLCanvasElement)return {width:image.width,height:image.height};
  return {width:0,height:0};
}
function cover(ctx:CanvasRenderingContext2D,img:CanvasImageSource,x:number,y:number,w:number,h:number){
  const {width:iw,height:ih}=imageSize(img);
  if(!iw||!ih)return;
  const scale=Math.max(w/iw,h/ih);
  const ww=iw*scale,hh=ih*scale;
  ctx.drawImage(img,x+(w-ww)/2,y+(h-hh)/2,ww,hh);
}
function contain(ctx:CanvasRenderingContext2D,img:CanvasImageSource,x:number,y:number,w:number,h:number){
  const {width:iw,height:ih}=imageSize(img);
  if(!iw||!ih)return;
  const scale=Math.min(w/iw,h/ih);
  const ww=iw*scale,hh=ih*scale;
  ctx.drawImage(img,x+(w-ww)/2,y+(h-hh)/2,ww,hh);
}
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));
}

/** Format Brazilian WhatsApp numbers without inventing a country code. */
export function formatCinematicWhatsApp(raw:string){
  const input=raw.replace(/\D/g,"");
  const digits=input.startsWith("55")&&(input.length===12||input.length===13)
    ?input.slice(2):input;
  if(digits.length===11)return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  if(digits.length===10)return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
  return digits.slice(0,15);
}
/** WhatsApp-inspired contact badge, vector rendered directly in PNG and MP4. */
function drawContactBadge(ctx:CanvasRenderingContext2D,x:number,y:number,text:string,maxW:number,wide:boolean){
  ctx.save();
  const size=wide?32:29;
  ctx.font="800 "+size+"px Arial, Helvetica, sans-serif";
  let label=text;
  const padding=27,iconSize=56,gap=15,minimum=210;
  const allowed=Math.max(minimum,maxW);
  while(label.length>1&&ctx.measureText(label).width+padding*2+iconSize+gap>allowed){
    label=label.slice(0,-2).trimEnd()+"…";
  }
  const badgeW=Math.min(allowed,Math.max(minimum,ctx.measureText(label).width+padding*2+iconSize+gap));
  const h=76;
  ctx.fillStyle="rgba(7,22,28,0.91)";
  roundRect(ctx,x,y,badgeW,h,24);ctx.fill();
  ctx.strokeStyle="rgba(57,220,139,0.45)";ctx.lineWidth=2;
  roundRect(ctx,x+1,y+1,badgeW-2,h-2,23);ctx.stroke();
  const cx=x+padding+26,cy=y+h/2;
  // Green speech bubble, with a compact white handset symbol.
  ctx.fillStyle="#25D366";
  ctx.beginPath();ctx.arc(cx,cy,25,0,Math.PI*2);ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx-13,cy+17);ctx.lineTo(cx-18,cy+26);ctx.lineTo(cx-4,cy+19);
  ctx.fill();
  ctx.fillStyle="#fff";
  ctx.beginPath();
  ctx.moveTo(cx-10,cy-13);
  ctx.bezierCurveTo(cx-16,cy-12,cx-16,cy-1,cx-10,cy+8);
  ctx.bezierCurveTo(cx-4,cy+17,cx+7,cy+19,cx+12,cy+12);
  ctx.lineTo(cx+7,cy+5);ctx.lineTo(cx+2,cy+8);
  ctx.bezierCurveTo(cx-3,cy+5,cx-7,cy+1,cx-8,cy-4);
  ctx.lineTo(cx-4,cy-8);ctx.closePath();ctx.fill();
  ctx.textAlign="left";ctx.textBaseline="middle";
  ctx.fillStyle="#f5fff9";
  ctx.fillText(label,x+padding+iconSize+gap,y+h/2+1);
  ctx.restore();
}
function wrap(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number,maxLines:number){
  const words=text.replace(/\s+/g," ").trim().split(" ");
  let lines:string[]=[],line="";
  for(const word of words){
    const next=line?line+" "+word:word;
    if(ctx.measureText(next).width>maxWidth&&line){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  if(lines.length>maxLines){
    lines=lines.slice(0,maxLines);
    let last=lines[maxLines-1];
    while(last.length>0&&ctx.measureText(last+"…").width>maxWidth)last=last.slice(0,-1);
    lines[maxLines-1]=last.trimEnd()+"…";
  }
  for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],x,y+i*lineHeight);
  return y+lines.length*lineHeight;
}
export function cinematicVideoFrameRect(
  ctx:CanvasRenderingContext2D,opt:Omit<CinematicOptions,"video">
){
  const w=opt.width,h=opt.height,wide=w>h;
  const margin=wide?100:68;
  const fontSize=wide?82:h>=1900?74:58;
  const titleY=wide?250:h>=1900?355:255;
  const maxWidth=wide?w*.67:w-margin*2;
  ctx.save();ctx.font="900 "+fontSize+"px Arial, Helvetica, sans-serif";
  let lines:string[]=[],line="";
  for(const word of opt.title.replace(/\s+/g," ").trim().split(" ")){
    const joined=line?line+" "+word:word;
    if(ctx.measureText(joined).width>maxWidth&&line){lines.push(line);line=word;}else line=joined;
  }
  if(line)lines.push(line);
  ctx.restore();
  const count=Math.max(1,Math.min(2,lines.length));
  const metadataY=titleY+count*fontSize*1.11+16;
  const x=margin,y=Math.max(wide?330:h>=1900?560:408,metadataY+48);
  const width=w-margin*2,height=Math.round(width*9/16);
  return {x,y,width,height};
}
export function renderCinematic(ctx:CanvasRenderingContext2D,opt:CinematicOptions){
  const {width:w,height:h}=opt;
  const wide=w>h;
  const accent=/^#[0-9a-f]{6}$/i.test(opt.color)?opt.color:"#60a5fa";
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#070c18";ctx.fillRect(0,0,w,h);
  const bg=opt.background??opt.poster;
  if(bg){
    if(opt.backgroundIsPoster)contain(ctx,bg,0,0,w,h);
    else cover(ctx,bg,0,0,w,h);
  }
  // Original TMDB imagery is only cropped, not distorted or synthesized.
  const shade=ctx.createLinearGradient(0,0,0,h);
  shade.addColorStop(0,"rgba(3,9,23,0.52)");
  shade.addColorStop(.22,"rgba(3,9,23,0.32)");
  shade.addColorStop(.5,opt.mode==="video"?"rgba(2,7,19,.74)":"rgba(3,9,23,.22)");
  shade.addColorStop(.78,"rgba(2,6,17,.89)");
  shade.addColorStop(1,"rgba(1,5,14,.98)");
  ctx.fillStyle=shade;ctx.fillRect(0,0,w,h);
  const side=ctx.createLinearGradient(0,0,w,0);
  side.addColorStop(0,"rgba(2,7,20,.42)");
  side.addColorStop(.57,"rgba(2,7,20,0)");
  side.addColorStop(1,"rgba(2,7,20,.28)");
  ctx.fillStyle=side;ctx.fillRect(0,0,w,h);
  if(opt.lighting!=="natural"){
    const glow=ctx.createRadialGradient(w*.7,h*.42,0,w*.7,h*.42,w*.74);
    glow.addColorStop(0,opt.lighting==="warm"?"rgba(239,140,55,.18)":"rgba(37,99,235,.19)");
    glow.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  }
  // Cinematic border plus safe outer margin
  ctx.strokeStyle="rgba(255,255,255,.14)";ctx.lineWidth=2;
  ctx.strokeRect(20,20,w-40,h-40);
  const margin=wide?100:68;
  ctx.textBaseline="alphabetic";
  const logoW=wide?240:180,logoH=wide?104:100;
  const logoX=opt.logoPosition==="left"?margin:w-margin-logoW;
  const brandTextX=opt.logoPosition==="left"?logoX:margin;
  if(opt.logo){
    ctx.save();ctx.shadowColor="rgba(0,0,0,.55)";ctx.shadowBlur=18;
    contain(ctx,opt.logo,logoX,55,logoW,logoH);ctx.restore();
  }else{
    ctx.font="800 34px Arial, sans-serif";ctx.fillStyle="#fff";
    wrap(ctx,opt.brand||"Stream Monitor",brandTextX,104,wide?370:480,40,2);
  }
  if(opt.logo&&opt.brand){
    ctx.fillStyle="rgba(255,255,255,.95)";
    ctx.font="700 26px Arial, sans-serif";
    ctx.textAlign=opt.logoPosition==="left"?"left":"right";
    ctx.fillText(opt.brand, opt.logoPosition==="left"?margin:w-margin,184);
    ctx.textAlign="left";
  }
  const badgeText=opt.label.toUpperCase().slice(0,30);
  ctx.font="900 25px Arial, sans-serif";
  const badgeW=Math.min(w*.44,Math.max(166,ctx.measureText(badgeText).width+52));
  const badgeX=opt.logoPosition==="left"?w-margin-badgeW:margin;
  ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=22;
  ctx.fillStyle=accent;roundRect(ctx,badgeX,72,badgeW,52,17);ctx.fill();ctx.restore();
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.fillText(badgeText,badgeX+badgeW/2,107);ctx.textAlign="left";
  const titleFont=wide?82:h>=1900?74:opt.mode==="video"?58:64;
  ctx.font="900 "+titleFont+"px Arial, Helvetica, sans-serif";
  ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,.74)";ctx.shadowBlur=26;
  let titleY:number;
  if(opt.mode==="video")titleY=wide?250:h>=1900?355:255;
  else titleY=wide?h*.53:h*.53;
  const titleLimit=opt.mode==="video"?2:3;
  const titleWidth=wide?w*.67:opt.mode==="banner"&&opt.posterVisible&&opt.poster?w-margin*2-245:w-margin*2;
  const lastTitle=wrap(ctx,opt.title,margin,titleY,titleWidth,titleFont*1.11,titleLimit);
  ctx.shadowBlur=0;
  const meta=[opt.year,opt.genre,opt.classification].filter(Boolean).join("  •  ");
  ctx.font="700 "+(wide?28:26)+"px Arial, sans-serif";
  ctx.fillStyle="rgba(230,240,255,.9)";
  const metadataY=opt.mode==="video"?lastTitle+16:Math.min(h-265,lastTitle+10);
  wrap(ctx,meta,margin,metadataY,wide?w*.72:w-margin*2,34,2);
  let textY:number;
  if(opt.mode==="video"){
    const {x,y,width:vw,height:vh}=cinematicVideoFrameRect(ctx,opt);
    ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=38;
    ctx.fillStyle="#030713";roundRect(ctx,x-8,y-8,vw+16,vh+16,25);ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.stroke();ctx.restore();
    ctx.save();roundRect(ctx,x,y,vw,vh,18);ctx.clip();
    ctx.fillStyle="#020611";ctx.fillRect(x,y,vw,vh);
    if(opt.video&&opt.video.readyState>=2&&opt.video.videoWidth>0){
      // Explicit browser-granted tab capture may need to crop the source
      // viewport to its video iframe. Preserve that region's aspect ratio.
      const crop=opt.videoCrop;
      if(crop&&crop.sw>0&&crop.sh>0){
        const scale=Math.min(vw/crop.sw,vh/crop.sh);
        const dw=crop.sw*scale,dh=crop.sh*scale;
        ctx.drawImage(opt.video,crop.sx,crop.sy,crop.sw,crop.sh,
          x+(vw-dw)/2,y+(vh-dh)/2,dw,dh);
      }else{
        contain(ctx,opt.video,x,y,vw,vh);
      }
    }else{
      ctx.textAlign="center";ctx.fillStyle="#e2e8f0";
      ctx.font="700 27px Arial, sans-serif";
      ctx.fillText("ÁREA DO MP4 AUTORIZADO",x+vw/2,y+vh/2);
      ctx.font="23px Arial, sans-serif";
      ctx.fillStyle="#94a3b8";
      ctx.fillText("O trailer do YouTube não é exportado",x+vw/2,y+vh/2+43);
      ctx.textAlign="left";
    }
    ctx.restore();
    textY=y+vh+72;
  }else{
    textY=Math.max(wide?h*.76:h*.76,metadataY+54);
    if(opt.posterVisible&&opt.poster){
      const pw=wide?235:225,ph=wide?330:322;
      const x=w-margin-pw,y=wide?280:h*.28;
      ctx.save();ctx.shadowColor="rgba(0,0,0,.85)";ctx.shadowBlur=32;
      ctx.fillStyle="rgba(0,0,0,.45)";roundRect(ctx,x-8,y-8,pw+16,ph+16,15);ctx.fill();
      ctx.restore();
      ctx.save();roundRect(ctx,x,y,pw,ph,11);ctx.clip();
      contain(ctx,opt.poster,x,y,pw,ph);ctx.restore();
      ctx.strokeStyle="rgba(255,255,255,.55)";ctx.lineWidth=2;roundRect(ctx,x,y,pw,ph,11);ctx.stroke();
    }
  }
  ctx.fillStyle=accent;ctx.fillRect(margin,textY-34,104,5);
  ctx.fillStyle="rgba(247,250,255,.93)";
  ctx.font="500 "+(wide?30:29)+"px Arial, sans-serif";
  const reserveBottom=wide?146:164;
  const available=Math.max(0,h-reserveBottom-textY);
  const lines=Math.max(0,Math.min(4,Math.floor(available/44)));
  if(lines)wrap(ctx,opt.overview||"Sinopse não disponível na TMDB.",margin,textY,w-margin*2,44,lines);
  // Clean reseller-only footer: no Stream Monitor or TMDB watermark in
  // the exported artwork. TMDB attribution remains visible in the editor.
  const footerTop=h-145;
  ctx.fillStyle="rgba(255,255,255,.21)";
  ctx.fillRect(margin,footerTop,w-margin*2,1);
  const formattedPhone=formatCinematicWhatsApp(opt.whatsapp);
  const contact=formattedPhone||opt.brand||"Contato da revenda";
  drawContactBadge(ctx,margin,h-121,contact,w-margin*2,wide);
}
