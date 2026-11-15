/**
 * Normalize reseller logos to transparent-compatible PNG before drawing them.
 * Existing transparent pixels are preserved exactly. For opaque images with
 * a nearly uniform pure white/black matte at >= 3 corners, only the matching
 * outside-connected matte is cleared; the interior artwork is untouched.
 * Files/settings stored by the reseller are not modified.
 */
export async function normalizeCinematicLogoPng(img:HTMLImageElement):Promise<HTMLImageElement>{
  const w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h)throw new Error("Logo inválida.");
  const maxDimension=1400;
  const scale=Math.min(1,maxDimension/Math.max(w,h));
  const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  const canvas=document.createElement("canvas");
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext("2d",{willReadFrequently:true});
  if(!context)throw new Error("Não foi possível preparar a logo PNG.");
  context.clearRect(0,0,width,height);
  context.drawImage(img,0,0,width,height);

  const pixels=context.getImageData(0,0,width,height);
  const rgba=pixels.data;
  let hasRealTransparency=false;
  for(let k=3;k<rgba.length;k+=4){
    if(rgba[k]<246){hasRealTransparency=true;break;}
  }
  if(!hasRealTransparency && width>=3 && height>=3){
    const corners=[0,width-1,(height-1)*width,width*height-1];
    const colors=corners.map(i=>[rgba[4*i],rgba[4*i+1],rgba[4*i+2]]);
    const approxWhite=colors.filter(c=>c.every(v=>v>=218)).length>=3;
    const approxBlack=colors.filter(c=>c.every(v=>v<=55)).length>=3;
    if(approxWhite||approxBlack){
      const cornerCandidates=colors.filter(c=>approxWhite?c.every(v=>v>=218):c.every(v=>v<=55));
      const matte=[0,1,2].map(i=>Math.round(cornerCandidates.reduce((sum,c)=>sum+c[i],0)/cornerCandidates.length));
      const visited=new Uint8Array(width*height);
      const queue=new Int32Array(width*height);
      let head=0,tail=0;
      const matches=(i:number)=>{
        const off=i*4;
        return rgba[off+3]>=245 &&
          Math.abs(rgba[off]-matte[0])<=38 &&
          Math.abs(rgba[off+1]-matte[1])<=38 &&
          Math.abs(rgba[off+2]-matte[2])<=38;
      };
      const enqueue=(i:number)=>{
        if(i<0||i>=visited.length||visited[i]||!matches(i))return;
        visited[i]=1;queue[tail++]=i;
      };
      for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}
      for(let y=0;y<height;y++){enqueue(y*width);enqueue(y*width+width-1);}
      while(head<tail){
        const i=queue[head++],off=i*4;
        rgba[off+3]=0;
        const x=i%width;
        if(x>0)enqueue(i-1);
        if(x<width-1)enqueue(i+1);
        if(i>=width)enqueue(i-width);
        if(i<visited.length-width)enqueue(i+width);
      }
      if(tail>0)context.putImageData(pixels,0,0);
    }
  }
  const png=canvas.toDataURL("image/png");
  // The same PNG image is used in editor preview, canvas and exported MP4.
  const result=new Image();
  await new Promise<void>((resolve,reject)=>{
    result.onload=()=>resolve();
    result.onerror=()=>reject(new Error("Erro ao converter logo para PNG."));
    result.src=png;
  });
  canvas.width=0;canvas.height=0;
  return result;
}
