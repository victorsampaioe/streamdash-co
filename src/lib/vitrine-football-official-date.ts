/** Official UEFA schedule exception for exact, independently checked fixtures.
 * This does not replace FTWB for ordinary days or invent future matches.
 * Sources: UEFA Nations League 2026/27, Swiss FA 16 November 2026.
 */
const normalize=(name:string)=>name.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const known=[
 {day:"2026-11-16",time:"16:45",iso:"2026-11-16T19:45:00.000Z",
  first:["suica","switzerland","schweiz"],second:["escocia","scotland","schottland"]},
 {day:"2026-11-16",time:"16:45",iso:"2026-11-16T19:45:00.000Z",
  first:["alemanha","germany","deutschland"],second:["holanda","paises baixos","netherlands","the netherlands"]},
];
export function officialFixtureDate(home:string,away:string){
 const h=normalize(home),a=normalize(away);
 return known.find(m=>(m.first.includes(h)&&m.second.includes(a))||
   (m.first.includes(a)&&m.second.includes(h)))||null;
}
