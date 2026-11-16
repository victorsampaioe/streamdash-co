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
    expect(html).toContain("Time da Casa X Time Visitante");
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
  it("não inventa times quando não há jogos", () => {
    const html = renderToStaticMarkup(<FootballSchedulePoster {...base} matches={[]} />);
    expect(html).toContain("ESCOLHA JOGOS REAIS PARA MONTAR A ARTE");
  });
});
