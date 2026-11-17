import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FootballSchedulePoster } from "./football-schedule-poster";
import type { FootballMatch } from "@/lib/vitrine-football.functions";

const sample: FootballMatch = {
  id: "match-br-2026-11-16", home: "Time da Casa", away: "Time Visitante",
  homeId: "", awayId: "", homeBadge: "", awayBadge: "",
  league: "Campeonato Brasileiro", leagueId: "brazilian-serie-a",
  time: "18:30", day: "2026-11-16", iso: "2026-11-16T21:30:00Z",
};
const base = {
  kind: "today" as const,
  format: "feed" as const,
  matches: [sample],
  day: "2026-11-16",
  headline: "JOGOS DO DIA",
  brand: "Minha Revenda",
  logo: "",
  contact: "(85) 99999-9999",
  badgeImages: {},
  broadcastByMatch: {},
  playerPhoto: "",
  playerName: "",
  stadium: "",
  accent: "#ee1519",
};

describe("Vitrine Futebol — imagens e exportação", () => {
  it("exibe imediatamente o jogador enviado, independentemente de dados da fonte", () => {
    const html = renderToStaticMarkup(
      <FootballSchedulePoster {...base} playerPhoto="data:image/png;base64,PLAYER" playerName="Jogador local" />
    );
    expect(html).toContain('src="data:image/png;base64,PLAYER"');
    expect(html).toContain('alt="Jogador local"');
  });
  it("aplica escudos enviados por partida mesmo quando a fonte não fornece URLs", () => {
    const html = renderToStaticMarkup(<FootballSchedulePoster
      {...base} badgeImages={{
        ["home:" + sample.id]: "data:image/png;base64,HOME",
        ["away:" + sample.id]: "data:image/png;base64,AWAY",
      }}
    />);
    expect(html).toContain('src="data:image/png;base64,HOME"');
    expect(html).toContain('src="data:image/png;base64,AWAY"');
    expect(html).toContain("Time da Casa");
    expect(html).toContain("Time Visitante");
  });
  it("prioriza escudo manual em vez do escudo remoto e conserva cores e canais", () => {
    const source = { ...sample, homeBadge: "https://img.thesports.com/football/team/aa.png" };
    const html = renderToStaticMarkup(<FootballSchedulePoster
      {...base}
      matches={[source]}
      accent="#7537ed"
      broadcastByMatch={{ [source.id]: "Canal confirmado" }}
      badgeImages={{
        [source.homeBadge]: "data:image/png;base64,OLD",
        ["home:" + source.id]: "data:image/png;base64,NEW",
      }}
    />);
    expect(html).toContain('src="data:image/png;base64,NEW"');
    expect(html).not.toContain('src="data:image/png;base64,OLD"');
    expect(html).toContain("Canal confirmado");
    expect(html).toContain("#7537ed");
  });
  it("mostra iniciais identificadas em vez de remover escudos sem imagem da fonte",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base}/>);
    expect((html.match(/data-testid="football-crest-unavailable"/g)||[]).length).toBe(2);
    expect(html).toContain("Escudo indisponível: Time da Casa");
    expect(html).toContain("Escudo indisponível: Time Visitante");
  });
  it("usa imagens seguras por mandante e visitante na arte inteira",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base}
      matches={[{...sample,homeBadge:"https://ftwb.notiffly.com.br/a.png",
        awayBadge:"https://ftwb.notiffly.com.br/b.png"}]}
      badgeImages={{
        ["home:"+sample.id]:"data:image/png;base64,CLUBHOME",
        ["away:"+sample.id]:"data:image/png;base64,CLUBAWAY",
      }}/>
    );
    expect(html).toContain("data:image/png;base64,CLUBHOME");
    expect(html).toContain("data:image/png;base64,CLUBAWAY");
    expect(html).not.toContain("https://ftwb.notiffly.com.br/a.png");
    expect(html).not.toContain("https://ftwb.notiffly.com.br/b.png");
    expect(html).not.toContain("football-crest-unavailable");
  });
  it("não cria quadrados de escudos vazios quando a fonte não oferece imagem",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base} />);
    expect(html).not.toContain('src=""');
    expect(html).not.toContain("HORÁRIOS E TRANSMISSÕES SUJEITOS A CONFIRMAÇÃO");
    expect(html).toContain("height:210px");
  });
  it("exibe nomes em pt-BR sem truncar as letras nas fitas",()=>{
    const national:FootballMatch={...sample,home:"Singapore",away:"Brazil",
      league:"Amistoso Internacional",homeBadge:"",awayBadge:""};
    const html=renderToStaticMarkup(
      <FootballSchedulePoster {...base} matches={[national]}
        badgeImages={{["home:"+national.id]:"data:image/png;base64,SG",
          ["away:"+national.id]:"data:image/png;base64,BR"}}/>
    );
    expect(html).toContain(">Singapura</span>");
    expect(html).toContain(">Brasil</span>");
    expect(html).not.toContain(">Singapore</span>");
    expect(html).not.toContain("-webkit-line-clamp");
    expect(html).toContain("data:image/png;base64,SG");
    expect(html).toContain("data:image/png;base64,BR");
  });
  it("mantém quatro confrontos completos no mesmo banner",()=>{
    const second={...sample,id:"match-second",home:"Athletico-PR",away:"Paraná Clube"};
    const third={...sample,id:"match-third",home:"Flamengo",away:"Palmeiras"};
    const fourth={...sample,id:"match-fourth",home:"Corinthians",away:"São Paulo"};
    const fifth={...sample,id:"match-fifth",home:"Extra",away:"Extra 2"};
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base} matches={[sample,second,third,fourth,fifth]} />);
    for(const team of ["Time da Casa","Time Visitante","Athletico-PR","Paraná Clube","Flamengo","Palmeiras","Corinthians","São Paulo"]){
      expect(html).toContain(team);
    }
    expect(html).not.toContain("Extra 2");
    expect(html).not.toContain("HORÁRIOS E TRANSMISSÕES SUJEITOS");
  });
  it("mostra o telefone da revenda em formato (85) 99854-5009",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base} contact="85998545009" />);
    expect(html).toContain("(85) 99854-5009");
    expect(html).not.toContain(">85998545009<");
  });
  it("mostra só a logo no rodapé, sem escrever o nome Minha Revenda",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base} logo="data:image/png;base64,BRAND" />);
    expect(html).toContain('src="data:image/png;base64,BRAND"');
    expect(html).not.toContain("<strong");
    expect(html).not.toContain(">Minha Revenda</");
  });
  it("mostra horário original mesmo em jogo encerrado e Sem transmissão",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base}
      matches={[{...sample,status:"encerrado",scoreLabel:"2 × 0",time:"18:30"}]} />);
    expect(html).toContain("18:30");
    expect(html).toContain("Sem transmissão");
    expect(html).not.toContain("ENCERRADO");
    expect(html).not.toContain("A confirmar");
  });
  it("não inventa horário quando a fonte omite o início",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base}
      matches={[{...sample,time:"A confirmar"}]} />);
    expect(html).toContain("Horário indisponível");
    expect(html).not.toContain("00:00");
  });
  it("usa o estádio aprovado na prévia e no PNG e mantém a marca da revenda",()=>{
    const html=renderToStaticMarkup(<FootballSchedulePoster {...base} logo="data:image/png;base64,MARCA" />);
    expect(html).toContain('data-testid="football-stadium-image"');
    expect(html).toContain("/assets/vitrine-futebol-estadio.webp");
    expect(html).toContain('src="data:image/png;base64,MARCA"');
    expect(html).not.toContain("HORÁRIOS E TRANSMISSÕES SUJEITOS");
  });
  it("muda a tonalidade do fundo ao trocar a cor da arte",()=>{
    const blue=renderToStaticMarkup(<FootballSchedulePoster {...base} accent="#146df2"/>);
    const red=renderToStaticMarkup(<FootballSchedulePoster {...base} accent="#ee1519"/>);
    const green=renderToStaticMarkup(<FootballSchedulePoster {...base} accent="#0ea56d"/>);
    expect(blue).toContain("/assets/vitrine-futebol-estadio.webp");
    expect(red).toContain("/assets/vitrine-futebol-estadio.webp");
    expect(blue.match(/hue-rotate\([^)]*\)/)?.[0]).not.toEqual(red.match(/hue-rotate\([^)]*\)/)?.[0]);
    expect(green.match(/hue-rotate\([^)]*\)/)?.[0]).not.toEqual(red.match(/hue-rotate\([^)]*\)/)?.[0]);
  });
  it("não inventa times quando não há jogos", () => {
    const html = renderToStaticMarkup(<FootballSchedulePoster {...base} matches={[]} />);
    expect(html).toContain("ESCOLHA JOGOS REAIS PARA MONTAR A ARTE");
  });
});
