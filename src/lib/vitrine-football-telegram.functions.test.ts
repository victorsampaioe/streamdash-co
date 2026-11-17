import { describe, expect, it } from "vitest";
import { parseRegisteredTelegramTarget, validateFootballPosterDataUrl } from "./vitrine-football-telegram.functions";

const BOT="123456789:ABCdefGhijkLMNOPqrstUVWxyzABCD12345678";
describe("Vitrine Futebol — envio seguro ao Telegram cadastrado",()=>{
  it("usa bot institucional apenas para chat válido",()=>{
    expect(parseRegisteredTelegramTarget("123456789",BOT)).toEqual({token:BOT,chat:"123456789"});
    expect(parseRegisteredTelegramTarget("-1001234567890",BOT)).toEqual({token:BOT,chat:"-1001234567890"});
    expect(parseRegisteredTelegramTarget("@minharevenda",BOT)).toEqual({token:BOT,chat:"@minharevenda"});
  });
  it("suporta um bot próprio cadastrado sem expor o token à interface",()=>{
    expect(parseRegisteredTelegramTarget(BOT+":123456789", "")).toEqual({
      token:BOT,chat:"123456789"
    });
  });
  it("recusa URL, nome inválido e alvo com credenciais incorretas",()=>{
    expect(parseRegisteredTelegramTarget("https://api.telegram.org",BOT)).toBeNull();
    expect(parseRegisteredTelegramTarget("123",BOT)).toBeNull();
    expect(parseRegisteredTelegramTarget("123456789","")).toBeNull();
    expect(parseRegisteredTelegramTarget("0:otherbot",BOT)).toBeNull();
  });
  it("verifica PNG completo de 2160x2700 e rejeita dados adulterados",()=>{
    const png=Buffer.alloc(1200,0);
    Buffer.from("89504e470d0a1a0a","hex").copy(png,0);
    png.write("IHDR",12,"ascii");
    png.writeUInt32BE(2160,16);png.writeUInt32BE(2700,20);
    const dataUrl="data:image/png;base64,"+png.toString("base64");
    expect(validateFootballPosterDataUrl(dataUrl).length).toBe(1200);
    png.writeUInt32BE(240,16);
    expect(()=>validateFootballPosterDataUrl("data:image/png;base64,"+png.toString("base64")))
      .toThrow("2160");
    expect(()=>validateFootballPosterDataUrl("data:text/html;base64,PHNjcmlwdD4="))
      .toThrow("PNG");
  });
});
