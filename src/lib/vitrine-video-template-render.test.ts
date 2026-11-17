import {describe,it,expect} from "vitest";
import {videoOverlayGeometry} from "./vitrine-video-template-render";
import {validateVideoTemplateFile,tusMetadata} from "./vitrine-video-template-upload";

describe("Biblioteca MP4 da revenda",()=>{
  it("mantém logo no alto e telefone abaixo dos ícones de aparelhos",()=>{
    const g=videoOverlayGeometry(512,910);
    expect(g.logo).toEqual({x:18,y:32,w:184,h:90});
    expect(g.whatsapp).toEqual({x:20,y:795,w:472,h:70});
    expect(g.whatsapp.y).toBeGreaterThan(g.logo.y+g.logo.h);
  });
  it("a geometria mantém proporção em MP4s maiores",()=>{
    const low=videoOverlayGeometry(512,910),high=videoOverlayGeometry(1024,1820);
    expect(high.logo.x).toBe(low.logo.x*2);
    expect(high.whatsapp.w).toBe(low.whatsapp.w*2);
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
