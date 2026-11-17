import { toPng } from "html-to-image";

export const FOOTBALL_ART_SIZE=1080;

/** Same html-to-image pipeline used in Vitrine Banner, plus native Canvas
 * compositing for crest/brand <img> elements that Safari/WebKit can silently
 * omit inside SVG foreignObject.
 *
 * The source is the actual unscaled FootballSchedulePoster DOM used by the
 * live preview, not a second approximated poster layout.
 */
export async function createFootballArtworkFile(
  source:HTMLDivElement,filename:string
):Promise<File>{
  if(source.getBoundingClientRect().width<FOOTBALL_ART_SIZE-1){
    throw new Error("A arte original precisa ter 1080 pixels antes da exportação.");
  }
  // Use exactly the same toPng options/strategy as Vitrine Banner.
  const url=await toPng(source,{
    width:FOOTBALL_ART_SIZE,height:FOOTBALL_ART_SIZE,pixelRatio:1,
    cacheBust:false,skipFonts:true,backgroundColor:"#071227",
    style:{transform:"none",transformOrigin:"top left"},
  });
  const composite=await new Promise<HTMLImageElement>((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>img.naturalWidth&&img.naturalHeight
      ?resolve(img):reject(new Error("A captura PNG ficou vazia."));
    img.onerror=()=>reject(new Error("A arte PNG não pôde ser aberta para verificar."));
    img.src=url;
  });
  const canvas=document.createElement("canvas");
  canvas.width=FOOTBALL_ART_SIZE;canvas.height=FOOTBALL_ART_SIZE;
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("Canvas indisponível para conferir a exportação.");
  ctx.drawImage(composite,0,0,FOOTBALL_ART_SIZE,FOOTBALL_ART_SIZE);

  // In Vitrine Banner, real images are composited over the html-to-image layer
  // because iOS sometimes drops them. Do the same here, but ONLY for icons and
  // brand logos. Don't paint the player/watermark above match cards.
  const root=source.getBoundingClientRect();
  const scaleX=FOOTBALL_ART_SIZE/root.width;
  const scaleY=FOOTBALL_ART_SIZE/root.height;
  const images=Array.from(source.querySelectorAll<HTMLImageElement>(
    'img[data-football-export-image]'
  ));
  for(const img of images){
    if(!img.complete||!img.naturalWidth||!img.naturalHeight)continue;
    // The server inlines approved external crests. An un-inlined remote image
    // can taint Canvas, so leave it to html-to-image instead.
    const imageUrl=img.currentSrc||img.src||"";
    if(/^https?:\/\//i.test(imageUrl)){
      try{if(new URL(imageUrl).origin!==document.location.origin)continue;}
      catch{continue;}
    }
    const rect=img.getBoundingClientRect();
    if(!rect.width||!rect.height)continue;
    const x=(rect.left-root.left)*scaleX;
    const y=(rect.top-root.top)*scaleY;
    const w=rect.width*scaleX;
    const h=rect.height*scaleY;
    const ratio=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const drawW=img.naturalWidth*ratio,drawH=img.naturalHeight*ratio;
    const style=getComputedStyle(img);
    const position=style.objectPosition||"center center";
    const right=/right/.test(position),left=/left/.test(position);
    const px=right?w-drawW:left?0:(w-drawW)/2;
    ctx.save();
    try{
      // Mirror object-fit: contain and brand footer's right alignment.
      ctx.drawImage(img,x+px,y+(h-drawH)/2,drawW,drawH);
    }catch{
      // A non-CORS crest cannot corrupt the entire PNG. If toPng didn't paint
      // it either, leave the original text/card layout intact.
    }finally{ctx.restore();}
  }
  const blob=await new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob(value=>value?resolve(value):
      reject(new Error("Canvas não gerou o PNG completo.")),"image/png");
  });
  if(blob.size<1000)throw new Error("O PNG gerado está vazio.");
  const header=await blob.slice(0,24).arrayBuffer();
  const view=new DataView(header);
  if(header.byteLength!==24||
     view.getUint32(0)!==0x89504e47||
     view.getUint32(4)!==0x0d0a1a0a||
     view.getUint32(16)!==FOOTBALL_ART_SIZE||
     view.getUint32(20)!==FOOTBALL_ART_SIZE){
    throw new Error("A exportação não retornou 1080 × 1080 completos.");
  }
  return new File([blob],filename,{type:"image/png"});
}
