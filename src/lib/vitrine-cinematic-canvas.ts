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
/**
 * Summarize only the synopsis supplied by TMDB/editor. Favor complete
 * sentences and natural clause boundaries; never draw a trailing "...".
 * All variants use measured text rather than a fixed character count.
 */
function synopsisSentences(input:string):string[]{
  const trailingIncomplete=/(?:\.{3,}|…)\s*$/.test(input.trim());
  const text=input
    .replace(/\.{2,}|…/g,".")
    .replace(/\s+/g," ")
    .trim();
  if(!text)return [];
  // Protect initials in film-character names such as "Wile E. Coyote".
  const protectedText=text.replace(/\b([A-Z])\.\s+(?=[A-Z])/g,"$1\uE000 ");
  const sentences=protectedText
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/)
    .map(part=>part.replace(/\uE000/g,".").trim())
    .filter(Boolean)
    .map(part=>/[.!?]$/.test(part)?part:part+".");
  // The TMDB description may end with a syntactically incomplete "...,"
  // segment. Prefer the complete preceding sentences, never invent an end.
  if(trailingIncomplete&&sentences.length>1)sentences.pop();
  return sentences;
}
function measureSynopsisLines(
  ctx:CanvasRenderingContext2D,text:string,maxWidth:number,
):string[]{
  const words=text.trim().split(/\s+/).filter(Boolean);
  const lines:string[]=[];
  let current="";
  for(const word of words){
    const proposed=current?current+" "+word:word;
    if(current&&ctx.measureText(proposed).width>maxWidth){
      lines.push(current);
      current=word;
    }else current=proposed;
  }
  if(current)lines.push(current);
  return lines;
}
function renderAdaptiveSynopsis(
  ctx:CanvasRenderingContext2D,source:string,x:number,y:number,width:number,
  availableHeight:number,preferredSize:number,minimumSize:number,maxLines:number,
){
  const original=synopsisSentences(source);
  const fallback="Sinopse disponível em breve.";
  const sentences=original.length?original:[fallback];
  const full=sentences.join(" ");
  const candidates:string[]=[full];
  // Produce coherent summaries from the original TMDB prose.
  for(let count=sentences.length-1;count>=1;count--){
    candidates.push(sentences.slice(0,count).join(" "));
  }
  // A very long first sentence can have a shorter meaningful final clause.
  const first=sentences[0];
  const clauses=first.split(/,\s+/);
  if(clauses.length>1){
    for(let offset=1;offset<clauses.length;offset++){
      const remainder=clauses.slice(offset).join(", ").trim();
      if(remainder.length>=34&&remainder.length<first.length){
        candidates.push(remainder[0].toUpperCase()+remainder.slice(1).replace(/[,.!?]+$/,"")+".");
      }
    }
  }
  let chosen:string[]|null=null;
  let chosenSize=preferredSize;
  const limit=Math.max(1,Math.floor(availableHeight/((minimumSize)*1.32)));
  // Prefer a short, complete idea at a readable size over a tiny font.
  for(let font=preferredSize;font>=minimumSize;font-=2){
    const lineHeight=Math.ceil(font*1.38);
    const linesAllowed=Math.min(maxLines,Math.floor(availableHeight/lineHeight));
    if(linesAllowed<1)continue;
    ctx.font=`500 ${font}px Arial, Helvetica, sans-serif`;
    for(const candidate of candidates){
      const lines=measureSynopsisLines(ctx,candidate,width);
      if(lines.length<=linesAllowed&&lines.every(l=>ctx.measureText(l).width<=width)){
        chosen=lines;
        chosenSize=font;
        break;
      }
    }
    if(chosen)break;
  }
  if(!chosen){
    // Last resort: preserve a short clause, ending with a full stop.
    // There is never a single dangling word or an ellipsis.
    chosenSize=minimumSize;
    const lineHeight=Math.ceil(chosenSize*1.38);
    const maxTextLines=Math.max(1,Math.min(maxLines,Math.floor(availableHeight/lineHeight),limit));
    ctx.font=`500 ${chosenSize}px Arial, Helvetica, sans-serif`;
    const words=first.split(/\s+/).filter(Boolean);
    while(words.length>3){
      const candidate=words.join(" ").replace(/[,;:.!?]+$/,"")+".";
      const trial=measureSynopsisLines(ctx,candidate,width);
      if(trial.length<=maxTextLines&&trial.every(l=>ctx.measureText(l).width<=width)){
        chosen=trial;break;
      }
      words.pop();
    }
    chosen??=measureSynopsisLines(ctx,"Confira a história deste título.",width).slice(0,maxTextLines);
  }
  const lineHeight=Math.ceil(chosenSize*1.38);
  ctx.font=`500 ${chosenSize}px Arial, Helvetica, sans-serif`;
  for(let i=0;i<chosen.length;i++){
    ctx.fillText(chosen[i],x,y+i*lineHeight);
  }
}
export function cinematicVideoFrameRect(
  ctx:CanvasRenderingContext2D,opt:Omit<CinematicOptions,"video">
){
  const w=opt.width,h=opt.height,wide=w>h;
  const margin=wide?100:68;
  const fontSize=wide?82:h>=1900?78:60;
  const titleY=wide?250:h>=1900?420:275;
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
  const x=margin,y=Math.max(wide?330:h>=1900?720:430,metadataY+(h>=1900?70:45));
  const width=w-margin*2,height=Math.round(width*9/16);
  return {x,y,width,height};
}
/** Paint only the changing MP4 region. Static backdrop, text, logo and footer
 * are drawn once outside the recording loop to avoid dropped frames and stalls.
 * Call with the same transform as the full artwork (e.g. 2/3 for WhatsApp).
 */
export function paintCinematicVideoFrame(
  ctx:CanvasRenderingContext2D,
  artwork:Omit<CinematicOptions,"video">,
  video:HTMLVideoElement,
){
  if(video.readyState<2||!video.videoWidth||!video.videoHeight)return;
  const {x,y,width,height}=cinematicVideoFrameRect(ctx,artwork);
  ctx.save();
  roundRect(ctx,x,y,width,height,18);
  ctx.clip();
  ctx.fillStyle="#020611";
  ctx.fillRect(x,y,width,height);
  // Letterbox rather than crop or distort the original video.
  contain(ctx,video,x,y,width,height);
  ctx.restore();
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
  // Logo-only branding for both static Banner and Video: no printed
  // "Minha Revenda", no Stream Monitor default watermark or name.
  // Preserve PNG transparency and original proportions in every format.
  const story=h>=1800&&!wide;
  const logoW=wide?286:story?322:278;
  const logoH=wide?128:story?190:146;
  const logoY=story?68:49;
  const logoX=opt.logoPosition==="left"?margin:w-margin-logoW;
  if(opt.logo){
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,.45)";
    ctx.shadowBlur=20;
    contain(ctx,opt.logo,logoX,logoY,logoW,logoH);
    ctx.restore();
  }
  const badgeText=opt.label.toUpperCase().slice(0,30);
  ctx.font="900 25px Arial, sans-serif";
  const badgeW=Math.min(w*.44,Math.max(166,ctx.measureText(badgeText).width+52));
  const badgeX=opt.logoPosition==="left"?w-margin-badgeW:margin;
  ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=22;
  ctx.fillStyle=accent;roundRect(ctx,badgeX,72,badgeW,52,17);ctx.fill();ctx.restore();
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.fillText(badgeText,badgeX+badgeW/2,107);ctx.textAlign="left";
  const titleFont=wide?82:h>=1900?78:opt.mode==="video"?60:64;
  ctx.font="900 "+titleFont+"px Arial, Helvetica, sans-serif";
  ctx.fillStyle="#fff";ctx.shadowColor="rgba(0,0,0,.74)";ctx.shadowBlur=26;
  let titleY:number;
  if(opt.mode==="video")titleY=wide?250:h>=1900?420:275;
  else titleY=wide?h*.53:story?h*.51:h*.53;
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
      ctx.fillText("PRÉVIA DO VÍDEO",x+vw/2,y+vh/2);
      ctx.font="23px Arial, sans-serif";
      ctx.fillStyle="#94a3b8";
      ctx.fillText("O trailer do YouTube não é exportado",x+vw/2,y+vh/2+43);
      ctx.textAlign="left";
    }
    ctx.restore();
    textY=y+vh+(h>=1800?83:62);
  }else{
    textY=Math.max(wide?h*.76:story?h*.69:h*.76,metadataY+54);
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
  const storyPost=story;
  const footerTop=storyPost?h-325:h-145;
  const contactTop=storyPost?h-292:h-121;
  const preferredFont=storyPost?38:wide?30:28;
  const minFont=storyPost?26:22;
  const textRoom=Math.max(0,footerTop-textY-37);
  // Adapt the synopsis to actual available space instead of silently
  // chopping words or appending ellipses in any export format.
  if(textRoom>=32){
    ctx.fillStyle=accent;
    ctx.fillRect(margin,textY-34,104,5);
    ctx.fillStyle="rgba(247,250,255,.93)";
    renderAdaptiveSynopsis(ctx,opt.overview||"Sinopse não disponível na TMDB.",
      margin,textY,w-margin*2,textRoom,preferredFont,minFont,
      storyPost?6:wide?3:4);
  }
  // Original reseller-only footer. Story placement respects app UI overlays.
  ctx.fillStyle="rgba(255,255,255,.21)";
  ctx.fillRect(margin,footerTop,w-margin*2,1);
  const formattedPhone=formatCinematicWhatsApp(opt.whatsapp);
  const contact=formattedPhone||"WhatsApp";
  drawContactBadge(ctx,margin,contactTop,contact,w-margin*2,wide);
}
