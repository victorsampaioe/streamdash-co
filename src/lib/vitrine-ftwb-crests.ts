/**
 * FTWB supplies team crests in several fixture shapes. Extract official
 * image references from the provided team's record only; never guess a
 * club's crest from its name or substitute another team's image.
 */
type Obj=Record<string,unknown>;
const obj=(x:unknown):Obj|null=>x&&typeof x==="object"&&!Array.isArray(x)?x as Obj:null;
const key=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
function get(record:unknown,...names:string[]):unknown{
 const target=obj(record);if(!target)return undefined;
 const aliases=new Set(names.map(key));
 for(const [name,value] of Object.entries(target)){
   if(aliases.has(key(name))&&value!==null&&value!==undefined&&value!=="")return value;
 }
 return undefined;
}
const iconKeys=[
 "escudo","escudo_url","url_escudo","escudoUrl","img_escudo",
 "logo","logo_url","logoUrl","img_logo","logotipo",
 "imagem","imagem_url","image","image_url","imageUrl","img","img_url",
 "badge","badge_url","crest","crest_url","shield","foto","photo",
 "avatar","icon","icone","src","href","original","url",
 "small","medium","large","thumbnail","default","primary","size150","size300","urlOriginal",
];
export function ftwbCrestUrl(raw:unknown):string{
 if(typeof raw!=="string")return "";
 const s=raw.trim().replaceAll("&amp;","&");
 if(!s)return "";
 // FTWB may supply an inline image; check it before the URL length cap.
 if(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)&&
    s.length<1_600_000)return s;
 if(s.length>2048)return "";
 // A team NAME must never be interpreted as a relative logo path.
 if(!/^(?:https?:\/\/|\/\/|\/)/i.test(s)&&
    !/^(?:(?:images?|img|assets?|static|uploads?|escudos?|logos?|teams?|times?)\/)/i.test(s)&&
    !/\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?|#|$)/i.test(s))return "";
 try{
   const url=new URL(s.startsWith("//")?"https:"+s:s,"https://ftwb.notiffly.com.br");
   // Source logos sometimes come through plain HTTP; prefer TLS.
   if(url.protocol==="http:")url.protocol="https:";
   if(url.protocol!=="https:"||url.username||url.password||url.port)return "";
   if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname))return "";
   if(url.hostname.endsWith(".local")||url.hostname.endsWith(".localhost"))return "";
   return url.toString();
 }catch{return "";}
}
function fromImageObject(source:unknown,depth=0):string{
 if(typeof source==="string")return ftwbCrestUrl(source);
 if(depth>3)return "";
 const record=obj(source);
 if(!record){
   if(Array.isArray(source)){
     for(const candidate of source.slice(0,3)){
       const result=fromImageObject(candidate,depth+1);
       if(result)return result;
     }
   }
   return "";
 }
 // Do not fall back to the name/league/competition logo.
 for(const field of iconKeys){
   const value=get(record,field);
   if(value!==undefined){
     const found=fromImageObject(value,depth+1);
     if(found)return found;
   }
 }
 for(const field of ["imagens","images","logos","escudos","badges","team","time","clube","club"]){
   const value=get(record,field);
   if(value!==undefined){
     const found=fromImageObject(value,depth+1);
     if(found)return found;
   }
 }
 return "";
}

const homeKeys=[
 "escudo_mandante","escudo_casa","logo_mandante","logo_casa","mandante_escudo",
 "mandante_logo","time_casa_escudo","time_casa_logo","home_logo","homeBadge",
 "homeTeamLogo","teamHomeBadge","escudoMandante","logoMandante","mandanteLogo",
 "home_team_badge","home_team_logo","logoA","escudoA","logo_time_a",
 "escudo_time_a","timeA_logo","timeALogo","logo_home",
 "img_time1_url","img_time_1_url","imagem_time1","imgTime1",
 "escudo_time1","escudo_time_1","escudoTime1","logo_time1","logo_time_1",
 "logoTime1","time1_logo","team1_logo","team1_badge","home_crest",
 "home_image","img_home","imagem_casa","image_home","img_mandante",
 "imagem_mandante","mandante_imagem","foto_mandante","logo_mandante_url","escudo_mandante_url",
 "escudo_home_url","home_logo_url","time1_escudo","time1_imagem","time1_badge",
];
const awayKeys=[
 "escudo_visitante","escudo_fora","logo_visitante","logo_fora","visitante_escudo",
 "visitante_logo","time_fora_escudo","time_fora_logo","away_logo","awayBadge",
 "awayTeamLogo","teamAwayBadge","escudoVisitante","logoVisitante",
 "away_team_badge","away_team_logo","logoB","escudoB","logo_time_b",
 "escudo_time_b","timeB_logo","timeBLogo","logo_away",
 "img_time2_url","img_time_2_url","imagem_time2","imgTime2",
 "escudo_time2","escudo_time_2","escudoTime2","logo_time2","logo_time_2",
 "logoTime2","time2_logo","team2_logo","team2_badge","away_crest",
 "away_image","img_away","imagem_fora","image_away","img_visitante",
 "imagem_visitante","visitante_imagem","foto_visitante","logo_visitante_url","escudo_visitante_url",
 "escudo_away_url","away_logo_url","time2_escudo","time2_imagem","time2_badge",
];
const homeSide=["home","home_team","mandante","casa","time_casa","teamHome","team_home","time1","time_1","equipe1","team1","timeA","equipeA","clube1"];
const awaySide=["away","away_team","visitante","fora","time_fora","teamAway","team_away","time2","time_2","equipe2","team2","timeB","equipeB","clube2"];
export function ftwbTeamCrest(record:unknown,team:unknown,side:"home"|"away"):string{
 const embedded=fromImageObject(team);
 if(embedded)return embedded;
 const fields=side==="home"?homeKeys:awayKeys;
 for(const field of fields){
   const value=get(record,field);
   if(value!==undefined){
     const found=fromImageObject(value);
     if(found)return found;
   }
 }
 const keys=side==="home"?homeSide:awaySide;
 for(const field of ["logos","escudos","badges","images","imagens","times","equipes","teams"]){
   const container=get(record,field);
   if(Array.isArray(container)){
     const found=fromImageObject(container[side==="home"?0:1]);
     if(found)return found;
   }
   const value=get(container,...keys);
   if(value!==undefined){
     const found=fromImageObject(value);
     if(found)return found;
   }
 }
 return "";
}
