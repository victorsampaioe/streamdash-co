import {createHmac,timingSafeEqual} from "node:crypto";

/** Only real fixture image URLs returned by the FTWB backend receive a
 * signed, short-lived capability. This allows arbitrary PUBLIC crest CDNs
 * from the provider without creating an unrestricted fetch/proxy endpoint.
 */
export function isSafeFootballCrestUrl(raw:string):boolean{
 try{
  if(raw.length>2048)return false;
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.port)return false;
  const host=url.hostname.toLowerCase();
  // Deliberately require a public hostname. IP literals, internal hosts,
  // localhost and link-local addresses may never be fetched from user URLs.
  if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host))return false;
  if(/\.(?:local|localhost|internal|lan|test|invalid|example|onion)$/.test(host))return false;
  return true;
 }catch{return false;}
}
function signInput(date:string,url:string,expires:number){
 return ["streammonitor-ftwb-crest-v1",date,url,String(expires)].join("\n");
}
function hmac(input:string,secret:string){
 return createHmac("sha256",secret).update(input).digest("hex");
}
export function signFootballCrestUrl(
 url:string,date:string,secret:string,now=Date.now(),
):string{
 if(!secret||!isSafeFootballCrestUrl(url)||!/\d{4}-\d{2}-\d{2}/.test(date))return "";
 const expiry=now+3*60*60_000;
 return expiry+"."+hmac(signInput(date,url,expiry),secret);
}
export function verifyFootballCrestUrl(
 url:string,date:string,proof:string,secret:string,now=Date.now(),
):boolean{
 if(!secret||!isSafeFootballCrestUrl(url)||!/\d{4}-\d{2}-\d{2}/.test(date))return false;
 const match=/^(\d{13})\.([a-f0-9]{64})$/i.exec(proof||"");
 if(!match)return false;
 const expires=Number(match[1]);
 if(expires<=now||expires>now+4*60*60_000)return false;
 const expected=hmac(signInput(date,url,expires),secret);
 return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(match[2],"hex"));
}
