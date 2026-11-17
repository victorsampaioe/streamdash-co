/**
 * Presentation-only PT-BR names and verified national-selection flag fallbacks.
 * Keep source IDs, original fixture names and broadcasters untouched.
 * Prefer the fixture provider's *actual team crest* whenever available.
 * A flag is a truthful fallback only for a senior national team, never a club.
 */
export function footballTeamKey(value:string):string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
type NationalSide={name:string;code:string;aliases:string[]};
const sides:NationalSide[]=[
  {name:"Brasil",code:"br",aliases:["Brazil","Brasil","Brazil national team","Seleção Brasileira"]},
  {name:"Singapura",code:"sg",aliases:["Singapore","Singapur","Singapura"]},
  {name:"Irlanda",code:"ie",aliases:["Ireland","Republic of Ireland","Irlanda","Eire","Éire"]},
  {name:"Irlanda do Norte",code:"gb-nir",aliases:["Northern Ireland","Irlanda do Norte"]},
  {name:"Kosovo",code:"xk",aliases:["Kosovo","Kosova"]},
  {name:"Polônia",code:"pl",aliases:["Poland","Polonia","Polônia","Polska"]},
  {name:"Suécia",code:"se",aliases:["Sweden","Suecia","Suécia","Sverige"]},
  {name:"País de Gales",code:"gb-wls",aliases:["Wales","Gales","País de Gales","Pais de Gales"]},
  {name:"Portugal",code:"pt",aliases:["Portugal"]},
  {name:"Dinamarca",code:"dk",aliases:["Denmark","Dinamarca","Danmark"]},
  {name:"Noruega",code:"no",aliases:["Norway","Noruega","Norge"]},
  {name:"Inglaterra",code:"gb-eng",aliases:["England","Inglaterra"]},
  {name:"Escócia",code:"gb-sct",aliases:["Scotland","Escócia","Escocia"]},
  {name:"Alemanha",code:"de",aliases:["Germany","Alemanha","Deutschland"]},
  {name:"França",code:"fr",aliases:["France","França","Franca"]},
  {name:"Espanha",code:"es",aliases:["Spain","España","Espanha"]},
  {name:"Itália",code:"it",aliases:["Italy","Itália","Italia"]},
  {name:"Países Baixos",code:"nl",aliases:["Netherlands","The Netherlands","Holland","Holanda","Países Baixos","Paises Baixos"]},
  {name:"Bélgica",code:"be",aliases:["Belgium","Bélgica","Belgica"]},
  {name:"Suíça",code:"ch",aliases:["Switzerland","Suíça","Suica"]},
  {name:"Áustria",code:"at",aliases:["Austria","Áustria"]},
  {name:"Croácia",code:"hr",aliases:["Croatia","Croácia","Croacia"]},
  {name:"Sérvia",code:"rs",aliases:["Serbia","Sérvia","Servia"]},
  {name:"Bósnia e Herzegovina",code:"ba",aliases:["Bosnia and Herzegovina","Bosnia","Bósnia e Herzegovina"]},
  {name:"Eslovênia",code:"si",aliases:["Slovenia","Eslovênia","Eslovenia"]},
  {name:"Eslováquia",code:"sk",aliases:["Slovakia","Eslováquia","Eslovaquia"]},
  {name:"República Tcheca",code:"cz",aliases:["Czech Republic","Czechia","República Tcheca","Republica Tcheca"]},
  {name:"Hungria",code:"hu",aliases:["Hungary","Hungria"]},
  {name:"Ucrânia",code:"ua",aliases:["Ukraine","Ucrânia","Ucrania"]},
  {name:"Rússia",code:"ru",aliases:["Russia","Rússia","Russia Federation"]},
  {name:"Turquia",code:"tr",aliases:["Turkey","Türkiye","Turkiye","Turquia"]},
  {name:"Grécia",code:"gr",aliases:["Greece","Grécia","Grecia"]},
  {name:"Romênia",code:"ro",aliases:["Romania","Romênia","Romenia"]},
  {name:"Bulgária",code:"bg",aliases:["Bulgaria","Bulgária"]},
  {name:"Albânia",code:"al",aliases:["Albania","Albânia","Albania"]},
  {name:"Macedônia do Norte",code:"mk",aliases:["North Macedonia","Macedônia do Norte","Macedonia do Norte"]},
  {name:"Montenegro",code:"me",aliases:["Montenegro"]},
  {name:"Islândia",code:"is",aliases:["Iceland","Islândia","Islandia"]},
  {name:"Finlândia",code:"fi",aliases:["Finland","Finlândia","Finlandia"]},
  {name:"Estônia",code:"ee",aliases:["Estonia","Estônia"]},
  {name:"Letônia",code:"lv",aliases:["Latvia","Letônia","Letonia"]},
  {name:"Lituânia",code:"lt",aliases:["Lithuania","Lituânia","Lituania"]},
  {name:"Luxemburgo",code:"lu",aliases:["Luxembourg","Luxemburgo"]},
  {name:"Chipre",code:"cy",aliases:["Cyprus","Chipre"]},
  {name:"Malta",code:"mt",aliases:["Malta"]},
  {name:"Israel",code:"il",aliases:["Israel"]},
  {name:"Geórgia",code:"ge",aliases:["Georgia","Geórgia","Georgia (country)"]},
  {name:"Armênia",code:"am",aliases:["Armenia","Armênia","Armenia"]},
  {name:"Azerbaijão",code:"az",aliases:["Azerbaijan","Azerbaijão","Azerbaijao"]},
  {name:"Cazaquistão",code:"kz",aliases:["Kazakhstan","Cazaquistão"]},
  {name:"Estados Unidos",code:"us",aliases:["United States","USA","United States of America","Estados Unidos","USMNT"]},
  {name:"Canadá",code:"ca",aliases:["Canada","Canadá"]},
  {name:"México",code:"mx",aliases:["Mexico","México"]},
  {name:"Argentina",code:"ar",aliases:["Argentina"]},
  {name:"Uruguai",code:"uy",aliases:["Uruguay","Uruguai"]},
  {name:"Paraguai",code:"py",aliases:["Paraguay","Paraguai"]},
  {name:"Chile",code:"cl",aliases:["Chile"]},
  {name:"Colômbia",code:"co",aliases:["Colombia","Colômbia","Colombia"]},
  {name:"Equador",code:"ec",aliases:["Ecuador","Equador"]},
  {name:"Peru",code:"pe",aliases:["Peru","Perú"]},
  {name:"Bolívia",code:"bo",aliases:["Bolivia","Bolívia"]},
  {name:"Venezuela",code:"ve",aliases:["Venezuela"]},
  {name:"Japão",code:"jp",aliases:["Japan","Japão","Japao"]},
  {name:"Coreia do Sul",code:"kr",aliases:["South Korea","Korea Republic","Republic of Korea","Coreia do Sul"]},
  {name:"Coreia do Norte",code:"kp",aliases:["North Korea","Korea DPR","DPR Korea","Coreia do Norte"]},
  {name:"China",code:"cn",aliases:["China","China PR","PR China"]},
  {name:"Austrália",code:"au",aliases:["Australia","Austrália","Australia"]},
  {name:"Nova Zelândia",code:"nz",aliases:["New Zealand","Nova Zelândia","Nova Zelandia"]},
  {name:"Marrocos",code:"ma",aliases:["Morocco","Marrocos"]},
  {name:"Egito",code:"eg",aliases:["Egypt","Egito"]},
  {name:"Senegal",code:"sn",aliases:["Senegal"]},
  {name:"Nigéria",code:"ng",aliases:["Nigeria","Nigéria"]},
  {name:"Camarões",code:"cm",aliases:["Cameroon","Camarões","Camaroes"]},
  {name:"Gana",code:"gh",aliases:["Ghana","Gana"]},
  {name:"Costa do Marfim",code:"ci",aliases:["Ivory Coast","Cote d'Ivoire","Côte d'Ivoire","Costa do Marfim"]},
  {name:"África do Sul",code:"za",aliases:["South Africa","África do Sul","Africa do Sul"]},
  {name:"Tunísia",code:"tn",aliases:["Tunisia","Tunísia","Tunisia"]},
  {name:"Argélia",code:"dz",aliases:["Algeria","Argélia","Argelia"]},
  {name:"Arábia Saudita",code:"sa",aliases:["Saudi Arabia","Arábia Saudita","Arabia Saudita"]},
  {name:"Irã",code:"ir",aliases:["Iran","IR Iran","Irã","Ira"]},
  {name:"Iraque",code:"iq",aliases:["Iraq","Iraque"]},
  {name:"Catar",code:"qa",aliases:["Qatar","Catar"]},
  {name:"Emirados Árabes Unidos",code:"ae",aliases:["United Arab Emirates","UAE","Emirados Árabes Unidos"]},
  {name:"Índia",code:"in",aliases:["India","Índia"]},
  {name:"Indonésia",code:"id",aliases:["Indonesia","Indonésia","Indonesia"]},
  {name:"Tailândia",code:"th",aliases:["Thailand","Tailândia","Tailandia"]},
  {name:"Vietnã",code:"vn",aliases:["Vietnam","Viet Nam","Vietnã","Vietna"]},
];
const nationalIndex=new Map<string,NationalSide>();
for(const side of sides){
  nationalIndex.set(footballTeamKey(side.name),side);
  for(const alias of side.aliases)nationalIndex.set(footballTeamKey(alias),side);
}

/** Never translate arbitrary club/trademark names via machine translation. */
export function footballTeamNamePtBR(original:string):string{
  const side=nationalIndex.get(footballTeamKey(original));
  return side?.name||original;
}
function isNationalFixture(competition:string):boolean{
  const name=footballTeamKey(competition);
  if(/\b(clubes|clubs|club world cup)\b/.test(name))return false;
  return /\b(nations league|liga das nacoes|amistos\w*|friendly|friendlies|selecoes|selecao|national team|copa do mundo|world cup|eliminatorias|qualifiers?|eurocopa|uefa euro|copa america|african cup|afcon|asian cup|copa asiatica|african nations|olimpic\w*|olympic\w*|european championship)\b/.test(name);
}
/** Only national teams get a country flag fallback. Country flags are not club emblems. */
export function nationalTeamFlagFallback(team:string,competition:string):string{
  if(!isNationalFixture(competition))return "";
  const side=nationalIndex.get(footballTeamKey(team));
  return side?`https://flagcdn.com/w160/${side.code}.png`:"";
}

/** Browser-native national flag fallback, used if the remote CDN cannot be read.
 * Uses standard ISO 3166-1 alpha-2 country codes. Some national teams (e.g.
 * Kosovo, Wales) do not have a universal two-letter flag emoji; those use an
 * honest initials badge instead of a wrong country's flag.
 */
export function nationalTeamFlagEmoji(team:string,competition:string):string{
  if(!isNationalFixture(competition))return "";
  const side=nationalIndex.get(footballTeamKey(team));
  if(!side || !/^[a-z]{2}$/.test(side.code) || side.code==="xk")return "";
  return [...side.code.toUpperCase()]
    .map(char=>String.fromCodePoint(0x1f1e6+char.charCodeAt(0)-65)).join("");
}
