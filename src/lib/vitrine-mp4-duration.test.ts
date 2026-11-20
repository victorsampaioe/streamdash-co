import {describe,expect,it} from "vitest";
import {repairMp4DurationHeaders} from "./vitrine-mp4-duration";

function box(type:string,data:Uint8Array){
  const bytes=new Uint8Array(8+data.length);
  new DataView(bytes.buffer).setUint32(0,bytes.length);
  for(let i=0;i<4;i++)bytes[4+i]=type.charCodeAt(i);
  bytes.set(data,8);
  return bytes;
}
function join(...parts:Uint8Array[]){
  const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let at=0;
  for(const part of parts){result.set(part,at);at+=part.length;}
  return result;
}
function movie(headerDuration:number,trackDuration:number,mediaDuration:number){
  const mvhd=new Uint8Array(100);
  const tkhd=new Uint8Array(84);
  const mdhd=new Uint8Array(24);
  new DataView(mvhd.buffer).setUint32(12,600); // movie timescale
  new DataView(mvhd.buffer).setUint32(16,headerDuration);
  new DataView(tkhd.buffer).setUint32(20,trackDuration);
  new DataView(mdhd.buffer).setUint32(12,48_000); // audio/media timescale
  new DataView(mdhd.buffer).setUint32(16,mediaDuration);
  const payload=join(box("mvhd",mvhd),box("trak",join(box("tkhd",tkhd),box("mdia",box("mdhd",mdhd)))));
  const result=join(box("ftyp",new Uint8Array(16)),box("moov",payload),box("mdat",new Uint8Array([11,22,33,44])));
  const offsets={mvhd:24+8+8+16,tkhd:24+8+108+8+8+20,mdhd:24+8+108+8+92+8+8+16};
  return {buffer:result.buffer,offsets,mdat:Array.from(result.slice(-4))};
}
describe("Duração confiável de MP4 no Safari",()=>{
  it("corrige 0xffffffff (~1988h) em mvhd/tkhd e 0 em mdhd sem tocar nos quadros",()=>{
    const {buffer,offsets,mdat}=movie(0xffffffff,0xffffffff,0);
    const result=repairMp4DurationHeaders(buffer,30);
    expect(result.repaired).toEqual(["mvhd","tkhd","mdhd"]);
    expect(result.movieDuration).toBe(30);
    const view=new DataView(buffer);
    expect(view.getUint32(offsets.mvhd)).toBe(18_000);
    expect(view.getUint32(offsets.tkhd)).toBe(18_000);
    expect(view.getUint32(offsets.mdhd)).toBe(1_440_000);
    expect(Array.from(new Uint8Array(buffer).slice(-4))).toEqual(mdat);
  });
  it("não modifica MP4s com duração válida",()=>{
    const {buffer}=movie(18_000,18_000,1_440_000);
    const bytes=new Uint8Array(buffer).slice();
    const result=repairMp4DurationHeaders(buffer,30);
    expect(result.repaired).toEqual([]);
    expect(result.movieDuration).toBe(30);
    expect(new Uint8Array(buffer)).toEqual(bytes);
  });
  it("recusa tempo esperado inválido",()=>{
    const {buffer}=movie(0xffffffff,0xffffffff,0);
    expect(()=>repairMp4DurationHeaders(buffer,0)).toThrow();
    expect(()=>repairMp4DurationHeaders(buffer,Number.POSITIVE_INFINITY)).toThrow();
  });
});
