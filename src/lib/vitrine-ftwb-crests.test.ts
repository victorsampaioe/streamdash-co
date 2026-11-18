import {describe,expect,it} from "vitest";
import {ftwbCrestUrl,ftwbTeamCrest} from "./vitrine-ftwb-crests";

describe("Escudos reais retornados pela FTWB para os jogos do dia",()=>{
  it("lê os escudos de Série A quando vierem como time1 e time2",()=>{
    const match={
      campeonato:"Brasileirão Série A",
      time1:{nome:"Flamengo",escudo:"https://cdn.ftwb.example.com/escudos/flamengo.png"},
      time2:{nome:"Palmeiras",escudo:"https://cdn.ftwb.example.com/escudos/palmeiras.png"},
    };
    expect(ftwbTeamCrest(match,match.time1,"home"))
      .toBe("https://cdn.ftwb.example.com/escudos/flamengo.png");
    expect(ftwbTeamCrest(match,match.time2,"away"))
      .toBe("https://cdn.ftwb.example.com/escudos/palmeiras.png");
  });
  it("aceita campos img_time1_url e img_time2_url sem cadastro prévio de clubes",()=>{
    const match={
      mandante:"Santos",visitante:"Bahia",
      img_time1_url:"https://football-cdn.example.org/teams/santos.webp",
      img_time2_url:"https://football-cdn.example.org/teams/bahia.webp",
    };
    expect(ftwbTeamCrest(match,match.mandante,"home")).toContain("/santos.webp");
    expect(ftwbTeamCrest(match,match.visitante,"away")).toContain("/bahia.webp");
  });
  it("lê escudos em coleções separadas por mandante e visitante",()=>{
    const match={
      home:"Corinthians",away:"Grêmio",
      imagens:{
        mandante:{logo_url:"/assets/escudos/corinthians.png"},
        visitante:{logo_url:"/assets/escudos/gremio.png"},
      },
    };
    expect(ftwbTeamCrest(match,match.home,"home"))
      .toBe("https://ftwb.notiffly.com.br/assets/escudos/corinthians.png");
    expect(ftwbTeamCrest(match,match.away,"away"))
      .toBe("https://ftwb.notiffly.com.br/assets/escudos/gremio.png");
  });
  it("não converte o nome de um time nem o logo do campeonato em escudo",()=>{
    const match={home:"São Paulo",away:"Cruzeiro",competition_logo:"https://cdn.example.org/brasileirao.png"};
    expect(ftwbTeamCrest(match,match.home,"home")).toBe("");
    expect(ftwbTeamCrest(match,match.away,"away")).toBe("");
    expect(ftwbCrestUrl("Flamengo")).toBe("");
    expect(ftwbCrestUrl("Palmeiras FC")).toBe("");
  });
  it("mantém um arquivo raster já enviado pela própria API",()=>{
    const inline="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    expect(ftwbTeamCrest({home:"Clube A",escudo_mandante:inline},"Clube A","home")).toBe(inline);
  });
  it("não aceita protocolos executáveis ou links de rede interna",()=>{
    expect(ftwbCrestUrl("javascript:alert(1)")).toBe("");
    expect(ftwbCrestUrl("http://127.0.0.1/private.png")).toBe("");
    expect(ftwbCrestUrl("data:text/html;base64,AAAA")).toBe("");
  });
});
