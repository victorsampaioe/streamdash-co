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
  poster:CanvasImageSource|null;
  logo:CanvasImageSource|null;
  video:HTMLVideoElement|null;
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
export function renderCinematic(ctx:CanvasRenderingContext2D,opt:CinematicOptions){
  const {width:w,height:h}=opt;
  const wide=w>h;
  const accent=/^#[0-9a-f]{6}$/i.test(opt.color)?opt.color:"#60a5fa";
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="#070c18";ctx.fillRect(0,0,w,h);
  const bg=opt.background??opt.poster;
  if(bg)cover(ctx,bg,0,0,w,h);
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
  const titleFont=wide?82:h>=1900?74:64;
  ctx.font="900 "+titleFont+"px Arial, Helvetica, sans-serif";
  ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,.74)";ctx.shadowBlur=26;
  let titleY:number;
  if(opt.mode==="video")titleY=wide?250:h>=1900?388:325;
  else titleY=wide?h*.56:h*.59;
  const titleLimit=opt.mode==="video"?2:3;
  const titleWidth=wide?w*.67:w-margin*2;
  const lastTitle=wrap(ctx,opt.title,margin,titleY,titleWidth,titleFont*1.11,titleLimit);
  ctx.shadowBlur=0;
  const meta=[opt.year,opt.genre,opt.classification].filter(Boolean).join("  •  ");
  ctx.font="700 "+(wide?28:26)+"px Arial, sans-serif";
  ctx.fillStyle="rgba(230,240,255,.9)";
  const metadataY=opt.mode==="video"?lastTitle+16:Math.min(h-265,lastTitle+10);
  wrap(ctx,meta,margin,metadataY,wide?w*.72:w-margin*2,34,2);
  let textY:number;
  if(opt.mode==="video"){
    const x=margin,y=wide?330:h>=1900?540:448;
    const vw=w-margin*2,vh=Math.round(vw*9/16);
    ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=38;
    ctx.fillStyle="#030713";roundRect(ctx,x-8,y-8,vw+16,vh+16,25);ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.stroke();ctx.restore();
    ctx.save();roundRect(ctx,x,y,vw,vh,18);ctx.clip();
    ctx.fillStyle="#020611";ctx.fillRect(x,y,vw,vh);
    if(opt.video&&opt.video.readyState>=2&&opt.video.videoWidth>0){
      // Preserve the trailer's framing and proportions: letterbox, never stretch.
      contain(ctx,opt.video,x,y,vw,vh);
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
    textY=wide?h*.75:h*.77;
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
  const footY=h-78;
  ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(margin,footY-35,w-margin*2,1);
  ctx.font="800 "+(wide?31:28)+"px Arial, sans-serif";
  ctx.fillStyle="#f6f9ff";
  const whats=opt.whatsapp.replace(/\D/g,"").slice(0,15);
  const contact=whats?"WhatsApp  "+whats:opt.brand;
  ctx.fillText(contact,margin,footY);
  ctx.textAlign="right";ctx.fillStyle="rgba(198,217,244,.78)";
  ctx.font="700 23px Arial, sans-serif";ctx.fillText("STREAM MONITOR",w-margin,footY);
  ctx.font="16px Arial, sans-serif";ctx.fillText("Dados e imagens: TMDB",w-margin,footY+30);
  ctx.textAlign="left";
}
