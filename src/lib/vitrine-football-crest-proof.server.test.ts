import {describe,expect,it} from "vitest";
import {isSafeFootballCrestUrl,signFootballCrestUrl,verifyFootballCrestUrl} from "./vitrine-football-crest-proof.server";

describe("Proxy de escudos oficiais por data e assinatura",()=>{
  const secret="ftwb-key-for-unit-test";
  const date="2026-11-18";
  const now=Date.parse("2026-11-18T12:00:00Z");
  it("autoriza imagens de CDNs públicas sem lista fixa de times ou provedores",()=>{
    const url="https://nova-cdn.futebol-exemplo.com.br/images/escudos/flamengo.webp";
    expect(isSafeFootballCrestUrl(url)).toBe(true);
    const proof=signFootballCrestUrl(url,date,secret,now);
    expect(proof).toMatch(/^\d{13}\.[a-f0-9]{64}$/);
    expect(verifyFootballCrestUrl(url,date,proof,secret,now+60_000)).toBe(true);
  });
  it("não permite reutilizar prova para outro escudo, outro dia ou expiração",()=>{
    const url="https://cdn.example.com.br/teams/1.png",other="https://cdn.example.com.br/teams/2.png";
    const proof=signFootballCrestUrl(url,date,secret,now);
    expect(verifyFootballCrestUrl(other,date,proof,secret,now)).toBe(false);
    expect(verifyFootballCrestUrl(url,"2026-11-19",proof,secret,now)).toBe(false);
    expect(verifyFootballCrestUrl(url,date,proof,secret,now+4*60*60_000)).toBe(false);
  });
  it("não autoriza hosts privados ou URLs arbitrárias",()=>{
    for(const url of [
      "https://127.0.0.1/escudo.png","http://cdn.example.org/a.png",
      "https://localhost/a.png","https://169.254.169.254/latest",
      "https://admin.internal/secret.png","https://usuario:senha@cdn.example.org/a.png",
      "https://cdn.example.org:8443/a.png",
    ]){
      expect(isSafeFootballCrestUrl(url),url).toBe(false);
      expect(signFootballCrestUrl(url,date,secret,now)).toBe("");
    }
  });
});
