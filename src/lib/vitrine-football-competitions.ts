/**
 * Curated first-division, national-cup and major international competitions for
 * promotional football posters. Reject minor, youth and reserve tournaments.
 */
const normalize = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function isYouthFootballFixture(competition: string, home: string, away: string): boolean {
  const subject=normalize([competition,home,away].join(" "));
  return /\b(sub ?(?:1[5-9]|2[0-9])|u ?(?:1[5-9]|2[0-9])|under ?(?:1[5-9]|2[0-9])|youth|junior|juvenil|base|reservas?|reserve)\b/.test(subject);
}

export function isMajorFootballCompetition(name: string): boolean {
  const n = normalize(name || "");
  if (!n || n === "futebol") return false;
  // UEFA Nations League only; exclude the CONCACAF tournament shown in earlier artwork.
  if (/concacaf|u ?20|sub ?20|sub ?23|afc|caf|ofc/.test(n)) return false;
  if (/\b(sub ?(?:1[5-9]|2[0-9])|u ?(?:1[5-9]|2[0-9])|under ?(?:1[5-9]|2[0-9])|youth|juvenil|junior|reservas?|reserve|sub ?20|sub ?23|4 ?divisao|terceira divisao|quarta divisao|serie [cd])\b/.test(n)) return false;

  return [
    /\bbrasileirao\b(?:\s+serie\s+[ab])?\b/,
    /\bcampeonato brasileiro\s*(?:serie\s*[ab])?\b/,
    /\bbrasileiro\s+serie\s+[ab]\b/,
    /\bbrasil\s+serie\s+[ab]\b/,
    /\bcampeonato\s+paulista\s+feminino\b/,
    /\bpaulistao\s+feminino\b/,
    /\bbrasileir(?:ao|o)\s+feminin[oa]\b/,
    /\bcopa do brasil\b/,
    /\b(?:copa )?libertadores\b/,
    /\b(?:copa )?(?:sul ?americana|sudamericana)\b/,
    /\brecopa sul ?americana\b/,
    /\b(?:uefa )?champions league\b/,
    /\bliga dos campeoes\b/,
    /\b(?:uefa )?europa league\b/,
    /\b(?:uefa )?conference league\b/,
    /\b(?:uefa )?nations league\b/,
    /\bliga das nacoes\b/,
    /\bcopa do mundo\b/,
    /\bworld cup\b/,
    /\beliminatorias\b/,
    /\bworld cup qualif\w*\b/,
    /\bcopa america\b/,
    /\bmundial de clubes\b/,
    /\bclub world cup\b/,
    /\bpremier league\b/,
    /\blaliga\b|\bla liga\b/,
    /\bbundesliga\b/,
    /\bligue 1\b/,
    /\b(?:italian|italiana|italiano)\s+serie a\b/,
    /\bserie a (?:italiana|italiano|italy)\b/,
    /\bserie a\b/,
    /\bliga portugal\b|\bprimeira liga\b/,
    /\bliga (?:profesional|profissional) (?:de )?(?:argentina|futbol argentino)\b/,
    /\bprimera division argentina\b/,
    /\bmajor league soccer\b|\bmls\b/,
  ].some(pattern => pattern.test(n));
}

/** Include adult international friendlies only when Brazil's senior selection plays.
 * Major club tournaments and senior national championships remain unchanged.
 */
export function isFeaturedFootballFixture(competition:string,home:string,away:string):boolean{
  if(isYouthFootballFixture(competition,home,away))return false;
  const league=normalize(competition);
  const friendly=/\bamistos(?:o|os|a|as)\b|\binternational\s+(?:friendly|friendlies|friendship\s+matches|friendly\s+games)\b|\bfriendly\s+(?:international|match|matches|games)\b/.test(league);
  if(friendly){
    const brazilTeam=(team:string)=>{
      const n=normalize(team);
      return /^(?:brasil|brazil|selecao brasileira|brazil national team|selecao do brasil)$/.test(n);
    };
    return brazilTeam(home)||brazilTeam(away);
  }
  return isMajorFootballCompetition(competition);
}
