import { describe,it,expect,vi,afterEach } from "vitest";
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{}}));
import { decodeLaunchImages,parseLaunchTarget,sendThreeFootballExamplesToRegisteredTelegram } from "./telegram-football-launch.server";
import { FOOTBALL_3MODELS_ANNOUNCEMENT } from "./telegram-football-launch-copy";

const bot="123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
function sample(){
  const img=Buffer.alloc(1500,1);
  img[0]=0xff;img[1]=0xd8;img[2]=0xff;
  return "data:image/jpeg;base64,"+img.toString("base64");
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("Lançamento de 3 modelos para Telegram",()=>{
  it("mantém legenda com 3 modelos, PNG e Telegram próprio",()=>{
    expect(FOOTBALL_3MODELS_ANNOUNCEMENT).toContain("EVENTOS DE HOJE");
    expect(FOOTBALL_3MODELS_ANNOUNCEMENT).toContain("JOGOS DO DIA");
    expect(FOOTBALL_3MODELS_ANNOUNCEMENT).toContain("FIM DE JOGO");
    expect(FOOTBALL_3MODELS_ANNOUNCEMENT).toContain("seu Telegram cadastrado");
    expect(FOOTBALL_3MODELS_ANNOUNCEMENT).toContain("\n");
    expect(FOOTBALL_3MODELS_ANNOUNCEMENT.length).toBeLessThan(1024);
  });
  it("aceita três exemplos JPEG autênticos e rejeita qualquer outro número",()=>{
    const gallery=decodeLaunchImages([sample(),sample(),sample()]);
    expect(gallery.map(x=>x.mime)).toEqual(["image/jpeg","image/jpeg","image/jpeg"]);
    expect(gallery.map(x=>x.filename)).toEqual([
      "stream-monitor-exemplo-1.jpg","stream-monitor-exemplo-2.jpg","stream-monitor-exemplo-3.jpg"]);
    expect(()=>decodeLaunchImages([sample(),sample()])).toThrow(/exatamente as três/);
    expect(()=>decodeLaunchImages(["data:image/jpeg;base64,abcd",sample(),sample()]))
      .toThrow();
  });
  it("valida chat cadastrado e token de bot separado por dois-pontos",()=>{
    expect(parseLaunchTarget("123456789",bot)).toEqual({token:bot,chat:"123456789"});
    expect(parseLaunchTarget(bot+":123456789",bot)).toEqual({token:bot,chat:"123456789"});
    expect(parseLaunchTarget("http://example.test",bot)).toBeNull();
    expect(parseLaunchTarget("",bot)).toBeNull();
  });
  it("publica uma única mídia em grupo com exatamente três fotos e anúncio",async()=>{
    let captured:FormData|null=null;
    vi.stubGlobal("fetch",vi.fn(async(_url:string,opts:RequestInit)=>{
      captured=opts.body as FormData;return Response.json({ok:true,result:[{message_id:1}]});
    }));
    const images=decodeLaunchImages([sample(),sample(),sample()]);
    await sendThreeFootballExamplesToRegisteredTelegram(images,{token:bot,chat:"123456789"});
    expect(captured).not.toBeNull();
    const form=captured!;
    expect(form.get("chat_id")).toBe("123456789");
    const media=JSON.parse(String(form.get("media")));
    expect(media).toHaveLength(3);
    expect(media[0].caption).toBe(FOOTBALL_3MODELS_ANNOUNCEMENT);
    expect(media[0].parse_mode).toBe("HTML");
    expect(media[1].caption).toBeUndefined();
    for(const i of [0,1,2]){
      expect(media[i].media).toBe("attach://photo"+i);
      expect((form.get("photo"+i) as File).size).toBeGreaterThan(1000);
    }
  });
  it("não confunde falha do Telegram com envio realizado",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({ok:false,description:"Bot was blocked"},{status:403})));
    await expect(sendThreeFootballExamplesToRegisteredTelegram(
      decodeLaunchImages([sample(),sample(),sample()]),{token:bot,chat:"123456789"}
    )).rejects.toThrow(/Telegram recusou/);
  });
});
