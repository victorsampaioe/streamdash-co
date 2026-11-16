/**
 * Source-checked, day-specific TV lineup, never a default for future fixtures.
 * Sources (published 16 Nov 2026):
 * https://diariodonordeste.verdesmares.com.br/jogada/jogos-de-segunda-feira-na-tv-veja-onde-assistir-e-horario-das-partidas-desta-segunda-16-1.3805607
 * https://veja.abril.com.br/esporte/jogos-de-hoje-segunda-feira-16-de-novembro-onde-assistir-futebol-ao-vivo-e-horarios/
 */
const normalize=(value:string)=>value.normalize("NFD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
type KnownBroadcast={first:string[];second:string[];channels:string[]};
const nationalLeague:KnownBroadcast[]=[
 {first:["alemanha","germany","deutschland"],second:["holanda","paises baixos","netherlands"],channels:["ESPN","Disney+"]},
 {first:["suica","switzerland","schweiz"],second:["escocia","scotland","schottland"],channels:["ESPN 4","Disney+"]},
 {first:["grecia","greece"],second:["servia","serbia"],channels:["SporTV"]},
 {first:["cazaquistao","kazakhstan"],second:["eslovaquia","slovakia"],channels:["ESPN 4","Disney+"]},
 {first:["ilhas faroe","faroe islands"],second:["moldavia","moldova"],channels:["SporTV 2"]},
 {first:["estonia","estonia national team"],second:["bulgaria"],channels:["SporTV 2"]},
 {first:["islandia","iceland"],second:["luxemburgo","luxembourg"],channels:["ESPN 4","Disney+"]},
 {first:["lituania","lithuania"],second:["liechtenstein"],channels:["Disney+"]},
 {first:["macedonia do norte","north macedonia"],second:["eslovenia","slovenia"],channels:["Disney+"]},
 {first:["gibraltar"],second:["malta"],channels:["Disney+"]},
 {first:["athletico pr","athletico paranaense","atletico pr","atletico paranaense"],
  second:["parana","parana clube"],channels:["FPF TV","Rede Furacão","TMC Esporte"]},
];
export function verifiedFootballBroadcasts(home:string,away:string,date:string):string[]{
 if(date!=="2026-11-16")return [];
 const h=normalize(home),a=normalize(away);
 const known=nationalLeague.find(m=>(m.first.includes(h)&&m.second.includes(a))||
  (m.first.includes(a)&&m.second.includes(h)));
 return known?.channels.slice(0,3)||[];
}
