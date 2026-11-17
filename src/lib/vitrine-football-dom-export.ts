import { toCanvas } from "html-to-image";

export const FOOTBALL_ART_SIZE=1080;

/** html-to-image (and WebKit image loading) often reject with a DOM Event,
 * not an Error. Convert anything into a readable, technical message. */
export function describeExportError(error:unknown):string{
  if(error instanceof Error)return error.message||error.name;
  if(typeof Event!=="undefined"&&error instanceof Event){
    const target=error.target as {src?:string;tagName?:string}|null;
    const src=target?.src?String(target.src):"";
    const what=src.startsWith("data:image/svg")?"a camada SVG da arte (o navegador recusou decodificar)":
      src?("a imagem "+(src.startsWith("data:")?"embutida":src.slice(0,80))):"um recurso da arte";
    return "Evento "+error.type+" ao carregar "+what+".";
  }
  if(typeof error==="string")return error;
  try{return JSON.stringify(error)}catch{return String(error)}
}

function withTimeout<T>(promise:Promise<T>,ms:number,label:string):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error(label+" excedeu "+Math.round(ms/1000)+"s.")),ms);
    promise.then(v=>{clearTimeout(t);resolve(v)},e=>{clearTimeout(t);reject(e)});
  });
}

/** Re-encode every drawable <img> to a small PNG at (displayed size × 2).
 * iOS Safari fails to decode the huge SVG/foreignObject data URL when it
 * embeds megabyte crests/logos/photos — the root cause of the rejected Event.
 * Cross-origin images that would taint the canvas are left untouched.
 * Returns a function restoring the original sources. */
export async function shrinkArtworkImages(source:HTMLElement):Promise<()=>void>{
  const restores:(()=>void)[]=[];
  const images=Array.from(source.querySelectorAll<HTMLImageElement>("img"));
  for(const img of images){
    const src=img.currentSrc||img.src;
    if(!src||!img.complete||!img.naturalWidth||!img.naturalHeight)continue;
    const rect=img.getBoundingClientRect();
    const boxW=Math.max(1,img.offsetWidth||rect.width),boxH=Math.max(1,img.offsetHeight||rect.height);
    const scale=Math.min(1,(boxW*2)/img.naturalWidth,(boxH*2)/img.naturalHeight);
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    if(src.startsWith("data:")&&src.length<120_000)continue;
    try{
      const canvas=document.createElement("canvas");
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d");
      if(!ctx)continue;
      ctx.drawImage(img,0,0,w,h);
      const small=canvas.toDataURL("image/png"); // throws if tainted
      canvas.width=canvas.height=0;
      if(small.length<30)continue;
      const original=img.getAttribute("src")||"";
      const srcset=img.getAttribute("srcset");
      if(srcset!==null)img.removeAttribute("srcset");
      img.src=small;
      restores.push(()=>{img.src=original;if(srcset!==null)img.setAttribute("srcset",srcset);});
    }catch{/* tainted (no CORS): html-to-image handles or omits it */}
  }
  await Promise.all(images.map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve()));
  return ()=>{for(const r of restores)r();};
}

/** Exports the actual, unscaled 1080×1080 FootballSchedulePoster DOM (the same
 * component used by the preview). Uses html-to-image's canvas directly, with a
 * WebKit warm-up pass (Safari paints foreignObject images only after the first
 * decode), then composites crest/brand <img>s that WebKit may drop. */
export async function createFootballArtworkFile(
  source:HTMLDivElement,filename:string
):Promise<File>{
  const box=source.getBoundingClientRect();
  if(box.width<FOOTBALL_ART_SIZE-1||box.height<FOOTBALL_ART_SIZE-1){
    throw new Error("A arte original precisa ter 1080×1080 antes da exportação (atual "+
      Math.round(box.width)+"×"+Math.round(box.height)+").");
  }
  const restore=await shrinkArtworkImages(source);
  let canvas:HTMLCanvasElement;
  try{
    const options={
      width:FOOTBALL_ART_SIZE,height:FOOTBALL_ART_SIZE,pixelRatio:1,
      canvasWidth:FOOTBALL_ART_SIZE,canvasHeight:FOOTBALL_ART_SIZE,
      cacheBust:false,skipFonts:true,backgroundColor:"#071227",
      imagePlaceholder:"data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      style:{transform:"none",transformOrigin:"top left",margin:"0"},
    };
    const isWebKit=typeof navigator!=="undefined"&&/AppleWebKit/i.test(navigator.userAgent)&&
      !/Chrome|Chromium|CriOS|Edg|Android/i.test(navigator.userAgent);
    if(isWebKit){
      try{
        const warm=await withTimeout(toCanvas(source,options),20000,"Pré-captura Safari");
        warm.width=warm.height=0;
      }catch{/* the real pass below reports the error */}
    }
    try{
      canvas=await withTimeout(toCanvas(source,options),25000,"Captura da arte");
    }catch(error){
      throw new Error("Captura da arte (html-to-image) falhou: "+describeExportError(error));
    }
  }finally{restore();}
  if(canvas.width!==FOOTBALL_ART_SIZE||canvas.height!==FOOTBALL_ART_SIZE){
    // Normalise device-pixel scaling if any browser ignored canvasWidth.
    const fixed=document.createElement("canvas");
    fixed.width=FOOTBALL_ART_SIZE;fixed.height=FOOTBALL_ART_SIZE;
    fixed.getContext("2d")?.drawImage(canvas,0,0,FOOTBALL_ART_SIZE,FOOTBALL_ART_SIZE);
    canvas=fixed;
  }
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas indisponível para conferir a exportação.");

  // Composite crests/brand logos at their exact boxes (WebKit may drop them).
  const root=source.getBoundingClientRect();
  const scaleX=FOOTBALL_ART_SIZE/root.width,scaleY=FOOTBALL_ART_SIZE/root.height;
  const images=Array.from(source.querySelectorAll<HTMLImageElement>('img[data-football-export-image]'));
  for(const img of images){
    if(!img.complete||!img.naturalWidth||!img.naturalHeight)continue;
    if(typeof getComputedStyle==="function"&&getComputedStyle(img).display==="none")continue;
    const imageUrl=img.currentSrc||img.src||"";
    if(/^https?:\/\//i.test(imageUrl)){
      try{if(new URL(imageUrl).origin!==document.location.origin)continue;}catch{continue;}
    }
    const rect=img.getBoundingClientRect();
    if(!rect.width||!rect.height)continue;
    const x=(rect.left-root.left)*scaleX,y=(rect.top-root.top)*scaleY;
    const w=rect.width*scaleX,h=rect.height*scaleY;
    const ratio=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const drawW=img.naturalWidth*ratio,drawH=img.naturalHeight*ratio;
    const position=(typeof getComputedStyle==="function"&&getComputedStyle(img).objectPosition)||"center center";
    const px=/right/.test(position)?w-drawW:/left/.test(position)?0:(w-drawW)/2;
    ctx.save();
    try{ctx.drawImage(img,x+px,y+(h-drawH)/2,drawW,drawH);}catch{/* skip */}finally{ctx.restore();}
  }
  let blob:Blob;
  try{
    blob=await new Promise<Blob>((resolve,reject)=>{
      canvas.toBlob(value=>value?resolve(value):
        reject(new Error("Canvas não gerou o PNG (memória do navegador?).")),"image/png");
    });
  }catch(error){
    throw new Error("Gravação do PNG falhou: "+describeExportError(error));
  }
  if(blob.size<1000)throw new Error("O PNG gerado está vazio ("+blob.size+" bytes).");
  const header=await blob.slice(0,24).arrayBuffer();
  const view=new DataView(header);
  if(header.byteLength!==24||view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a||
     view.getUint32(16)!==FOOTBALL_ART_SIZE||view.getUint32(20)!==FOOTBALL_ART_SIZE){
    throw new Error("A exportação não retornou 1080 × 1080 completos.");
  }
  return new File([blob],filename,{type:"image/png"});
}
