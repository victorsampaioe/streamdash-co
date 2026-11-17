import { describe, expect, it } from "vitest";
import { footballTeamNamePtBR, nationalTeamFlagFallback } from "./vitrine-football-ptbr";

describe("Futebol: apresentação brasileira e emblemas de seleções",()=>{
  it("traduz as seleções do banner de 17/11 para português brasileiro",()=>{
    const pairs=[
      ["Singapore","Singapura"],["Singapur","Singapura"],
      ["Brazil","Brasil"],["Ireland","Irlanda"],["Kosovo","Kosovo"],
      ["Poland","Polônia"],["Sweden","Suécia"],["Wales","País de Gales"],
      ["Denmark","Dinamarca"],["Norway","Noruega"],
    ] as const;
    for(const [original,pt] of pairs)
      expect(footballTeamNamePtBR(original)).toBe(pt);
  });
  it("normaliza acentos mas preserva nomes oficiais de clubes",()=>{
    expect(footballTeamNamePtBR("  País de Gales  ")).toBe("País de Gales");
    expect(footballTeamNamePtBR("Flamengo")).toBe("Flamengo");
    expect(footballTeamNamePtBR("Manchester United")).toBe("Manchester United");
    expect(footballTeamNamePtBR("Real Madrid")).toBe("Real Madrid");
  });
  it("fornece bandeiras verificáveis para amistoso de Brasil e Liga das Nações",()=>{
    expect(nationalTeamFlagFallback("Singapur","AMISTOSO INTERNACIONAL"))
      .toBe("https://flagcdn.com/w160/sg.png");
    expect(nationalTeamFlagFallback("Brasil","Amistoso Internacional"))
      .toBe("https://flagcdn.com/w160/br.png");
    expect(nationalTeamFlagFallback("Ireland","LIGA DAS NAÇÕES"))
      .toBe("https://flagcdn.com/w160/ie.png");
    expect(nationalTeamFlagFallback("Kosovo","UEFA Nations League"))
      .toBe("https://flagcdn.com/w160/xk.png");
    expect(nationalTeamFlagFallback("Wales","Liga das Nações"))
      .toBe("https://flagcdn.com/w160/gb-wls.png");
    expect(nationalTeamFlagFallback("Portugal","Liga das Nações"))
      .toBe("https://flagcdn.com/w160/pt.png");
  });
  it("não usa bandeira de país em lugar de escudo de clube",()=>{
    expect(nationalTeamFlagFallback("Brasil","Campeonato Brasileiro Série A")).toBe("");
    expect(nationalTeamFlagFallback("Portugal","Copa do Mundo de Clubes")).toBe("");
    expect(nationalTeamFlagFallback("Flamengo","Copa do Brasil")).toBe("");
    expect(nationalTeamFlagFallback("Barcelona","La Liga")).toBe("");
  });
  it("não traduz nomes desconhecidos nem atribui país não comprovado",()=>{
    expect(footballTeamNamePtBR("Clube XYZ")).toBe("Clube XYZ");
    expect(nationalTeamFlagFallback("Time Inexistente","Liga das Nações")).toBe("");
  });
});
