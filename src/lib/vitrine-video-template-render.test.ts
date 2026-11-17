import {describe,it,expect} from "vitest";
import {videoOverlayGeometry,paintResellerVideoFrame} from "./vitrine-video-template-render";
import {validateVideoTemplateFile,tusMetadata} from "./vitrine-video-template-upload";

describe("Biblioteca MP4 da revenda",()=>{
  it("mantém logo no alto e telefone abaixo dos ícones de aparelhos",()=>{
    const g=videoOverlayGeometry(512,910);
    expect(g.logo).toEqual({x:16,y:27,w:226,h:116});
    expect(g.whatsapp).toEqual({x:67,y:815,w:378,h:51});
    expect(g.whatsapp.y).toBeGreaterThan(g.logo.y+g.logo.h);
  });
  it("a geometria mantém proporção em MP4s maiores",()=>{
    const low=videoOverlayGeometry(512,910),high=videoOverlayGeometry(1024,1820);
    expect(high.logo.x).toBe(low.logo.x*2);
    expect(high.whatsapp.w).toBe(low.whatsapp.w*2);
  });
  it("mantém sobreposição do WhatsApp compacta e logo maior na prévia e no MP4",()=>{
    const a=videoOverlayGeometry(512,910),b=videoOverlayGeometry(512,910);
    expect(a).toEqual(b);
    expect(a.logo.w).toBeGreaterThan(184);
    expect(a.logo.h).toBeGreaterThan(90);
    expect(a.whatsapp.w).toBeLessThan(472);
    expect(a.whatsapp.h).toBeLessThan(70);
    expect(a.whatsapp.x+a.whatsapp.w).toBeLessThan(512);
    expect(a.whatsapp.y+a.whatsapp.h).toBeLessThan(910);
  });
  it("desenha a marca somente com pixels da logo, sem retângulo preto",()=>{
    const calls:{name:string;args:unknown[]}[]=[];
    const ctx=new Proxy({canvas:{width:512,height:910},
      measureText:(text:string)=>({width:String(text).length*10})
    } as any,{
      get(target,prop){
        if(prop in target)return target[prop];
        if(prop==="save"||prop==="restore")return (..._args:unknown[])=>{};
        return (...args:unknown[])=>{calls.push({name:String(prop),args});};
      },
      set(target,prop,value){target[prop]=value;return true;}
    }) as CanvasRenderingContext2D;
    const logo={naturalWidth:480,naturalHeight:120} as HTMLImageElement;
    const source={videoWidth:512,videoHeight:910} as HTMLVideoElement;
    paintResellerVideoFrame(ctx,source,{
      name:"Revenda",whatsapp:"(85) 99854-5009",color:"#146df2",logo
    },512,910);
    const logoCalls=calls.filter(call=>call.name==="drawImage"&&call.args[0]===logo);
    expect(logoCalls).toHaveLength(1);
    expect(Number(logoCalls[0].args[3])).toBeGreaterThan(184);
    // Exactly one rounded box for the slimmer WhatsApp footer and one for
    // the small icon. The transparent logo must NOT get a dark background.
    expect(calls.filter(call=>call.name==="roundRect")).toHaveLength(3);
    expect(calls.filter(call=>call.name==="fillText").map(call=>call.args[0]))
      .toContain("(85) 99854-5009");
  });
  it("bloqueia vídeos não MP4 e acima de 100 MB",()=>{
    expect(()=>validateVideoTemplateFile({name:"a.mp4",type:"video/mp4",size:36*1048576}))
      .not.toThrow();
    expect(()=>validateVideoTemplateFile({name:"video.mov",type:"video/quicktime",size:2500}))
      .toThrow(/somente vídeos MP4/);
    expect(()=>validateVideoTemplateFile({name:"a.mp4",type:"video/mp4",size:101*1048576}))
      .toThrow(/até 100 MB/);
  });
  it("gera metadados TUS para bucket privado e caminho preciso",()=>{
    const encoded=tusMetadata({bucketName:"vitrine-video-modelos",objectName:"templates/abc.mp4",contentType:"video/mp4"});
    expect(encoded).toContain("bucketName "+btoa("vitrine-video-modelos"));
    expect(encoded).toContain("objectName "+btoa("templates/abc.mp4"));
    expect(encoded).toContain("contentType "+btoa("video/mp4"));
  });
});
