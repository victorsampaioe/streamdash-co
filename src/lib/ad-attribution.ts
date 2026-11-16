import {readChoice} from "@/lib/consent";

/** First-party acquisition context. No marketing identifiers before opt-in. */
const KEY="sm_ad_attribution_v2";
const MAX_AGE_MS=30*86_400_000;
let memoryAttribution:AdAttribution|null=null;
let memoryWindow:Window|null=null;

export type AdPlatform="facebook"|"instagram"|"messenger"|"audience_network"|"other";
export type AttributionSource="meta_ads"|"other_campaign"|"social_unverified"|"organic"|"direct"|"referral";
export type AdAttribution={
  source:AttributionSource;
  evidence:"paid_utm"|"other_utm"|"unverified_social"|"organic_referrer";
  advertising_consent:true;
  utm_source?:string;utm_medium?:string;utm_campaign?:string;
  utm_content?:string;utm_term?:string;
  campaign_id?:string;adset_id?:string;ad_id?:string;
  click_id?:string;at:number;
};
const PAID_MEDIUM=/^(paid_social|paidsocial|cpc|ppc|paid|display)$/i;
const META_SOURCES=/^(facebook|fb|meta|instagram|ig|msg|messenger|an|audience_network)$/i;
function clean(value:string|null|undefined,limit=80){
  return value?value.slice(0,limit).replace(/[^a-zA-Z0-9_\-.]/g,"_"):undefined;
}
function isFresh(saved:AdAttribution|null):saved is AdAttribution{
  return !!saved&&saved.advertising_consent===true&&Number.isFinite(saved.at)
    &&saved.at<=Date.now()&&Date.now()-saved.at<MAX_AGE_MS;
}
export function platformFromUtm(src:string|null|undefined):AdPlatform|null{
  const s=(src||"").toLowerCase();
  if(!s)return null;
  if(s==="fb"||s==="facebook")return "facebook";
  if(s==="ig"||s==="instagram")return "instagram";
  if(s==="msg"||s==="messenger")return "messenger";
  if(s==="an"||s==="audience_network")return "audience_network";
  return "other";
}

/** Never label an organic social referral or fbclid-only visit as paid. */
export function classifyCampaign(source:string|null|undefined,medium:string|null|undefined,fbclid?:string|null):{
 source:AttributionSource;evidence:AdAttribution["evidence"]
}{
  if(META_SOURCES.test(source||"")&&PAID_MEDIUM.test(medium||""))
    return {source:"meta_ads",evidence:"paid_utm"};
  if(META_SOURCES.test(source||"")||fbclid)
    return {source:"social_unverified",evidence:"unverified_social"};
  if(source)return {source:"other_campaign",evidence:"other_utm"};
  return {source:"direct",evidence:"organic_referrer"};
}

export function captureAttribution():AdAttribution|null{
  if(typeof window==="undefined")return null;
  // Access/registration remains available with declined advertising cookies.
  if(readChoice("advertising")!=="granted")return null;
  const params=new URLSearchParams(window.location.search);
  const utmSource=params.get("utm_source");
  const fbclid=params.get("fbclid");
  const medium=params.get("utm_medium");
  const classification=classifyCampaign(utmSource,medium,fbclid);
  if(classification.source==="direct"){
    const ref=typeof document!=="undefined"?document.referrer:"";
    if(!ref)return null;
    try{
      const url=new URL(ref);
      if(url.origin===window.location.origin)return null;
      const source=/google|bing|duckduckgo/i.test(url.hostname)?"organic":"social_unverified";
      const attribution:AdAttribution={
        source,evidence:source==="organic"?"organic_referrer":"unverified_social",
        advertising_consent:true,at:Date.now()
      };
      return remember(attribution);
    }catch{return null;}
  }
  const existing=readAttribution();
  if(existing)return existing; // Immutable first campaign touch.
  return remember({
    source:classification.source,evidence:classification.evidence,advertising_consent:true,
    utm_source:clean(utmSource),utm_medium:clean(medium),
    utm_campaign:clean(params.get("utm_campaign")),
    utm_content:clean(params.get("utm_content")),utm_term:clean(params.get("utm_term")),
    campaign_id:clean(params.get("utm_campaign_id")),
    adset_id:clean(params.get("utm_adset_id")),ad_id:clean(params.get("utm_ad_id")),
    click_id:fbclid?clean(fbclid,250):undefined,at:Date.now(),
  });
}

function remember(attribution:AdAttribution){
  memoryAttribution=attribution;memoryWindow=window;
  try{window.localStorage?.setItem(KEY,JSON.stringify(attribution));}catch{}
  try{window.sessionStorage?.setItem(KEY,JSON.stringify(attribution));}catch{}
  return attribution;
}
export function readAttribution():AdAttribution|null{
  if(typeof window==="undefined"||readChoice("advertising")!=="granted")return null;
  try{
    const x=JSON.parse(window.localStorage?.getItem(KEY)||"null") as AdAttribution|null;
    if(isFresh(x))return x;
  }catch{}
  try{
    const x=JSON.parse(window.sessionStorage?.getItem(KEY)||"null") as AdAttribution|null;
    if(isFresh(x))return x;
  }catch{}
  return memoryWindow===window&&isFresh(memoryAttribution)?memoryAttribution:null;
}
export function readAttributionSource():string{
  return readAttribution()?.source??"direct";
}
export function readAttributionPlatform():string{
  const x=readAttribution();
  return x?.source==="meta_ads"?platformFromUtm(x.utm_source)??"unknown":"unknown";
}

export function sanitizeAcquisitionInput(input:unknown):{
 source:AttributionSource;platform:AdPlatform|null;evidence:string;
 utm_source:string|null;utm_medium:string|null;utm_campaign:string|null;
 utm_content:string|null;utm_term:string|null;
 campaign_id:string|null;adset_id:string|null;ad_id:string|null;
 click_id:string|null;first_access_at:string;advertising_consent:boolean;
}|null{
  if(!input||typeof input!=="object")return null;
  const a=input as Record<string,unknown>;
  if(a.advertising_consent!==true)return null;
  const get=(key:string,size=80):string|null=>
    typeof a[key]==="string"?clean(a[key] as string,size)||null:null;
  const utmSource=get("utm_source"),utmMedium=get("utm_medium");
  const clickId=get("click_id",250);
  const validated=classifyCampaign(utmSource,utmMedium,clickId);
  const now=Date.now();
  const first=typeof a.at==="number"&&Number.isFinite(a.at)&&a.at<=now
    &&a.at>=now-MAX_AGE_MS?new Date(a.at).toISOString():new Date(now).toISOString();
  return {
    source:validated.source,
    platform:validated.source==="meta_ads"?platformFromUtm(utmSource):null,
    evidence:validated.evidence,
    advertising_consent:true,
    utm_source:utmSource,utm_medium:utmMedium,utm_campaign:get("utm_campaign"),
    utm_content:get("utm_content"),utm_term:get("utm_term"),
    campaign_id:get("campaign_id"),adset_id:get("adset_id"),ad_id:get("ad_id"),
    click_id:clickId,first_access_at:first,
  };
}

/** Legacy profile columns. Server recomputes classification instead of trusting
 * user-provided source/platform flags.
 */
export function sanitizeAttributionInput(input:unknown):{
  acquisition_source:string;acquisition_platform:AdPlatform|null;
  acquisition_campaign:string|null;acquisition_content:string|null;
  acquisition_placement:string|null;
}|null{
  const x=sanitizeAcquisitionInput(input);
  if(!x)return null;
  return {
    acquisition_source:x.source,
    acquisition_platform:x.platform,
    acquisition_campaign:x.utm_campaign,
    acquisition_content:x.utm_content,
    acquisition_placement:x.utm_term,
  };
}
