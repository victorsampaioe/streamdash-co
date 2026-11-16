import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const consent=vi.hoisted(()=>({choice:"denied" as "denied"|"granted"}));
vi.mock("@/lib/consent",()=>({readChoice:()=>consent.choice}));
const store=()=>{
 const state=new Map<string,string>();
 return {
  getItem:(k:string)=>state.get(k)??null,
  setItem:(k:string,v:string)=>{state.set(k,v);},
  removeItem:(k:string)=>{state.delete(k);},
 };
};
function setup(search:string){
 const local=store(),session=store();
 (globalThis as any).window={
  location:{search,pathname:"/",hostname:"streammonitor.site",origin:"https://streammonitor.site"},
  localStorage:local,sessionStorage:session,
 };
}
beforeEach(()=>{
 vi.resetModules();consent.choice="denied";setup("");
});
afterEach(()=>{delete (globalThis as any).window;vi.clearAllMocks()});
describe("Consent and evidence-based first touch",()=>{
 it("never stores ad click ids or claims paid attribution without consent",async()=>{
  (window as any).location.search="?utm_source=ig&utm_medium=paid_social&fbclid=test";
  const a=await import("./ad-attribution");
  expect(a.captureAttribution()).toBeNull();
  expect(a.readAttribution()).toBeNull();
 });
 it("marks paid Instagram only when UTM medium is explicitly paid",async()=>{
  consent.choice="granted";
  (window as any).location.search="?utm_source=ig&utm_medium=paid_social&utm_campaign=novembro&utm_campaign_id=123&utm_ad_id=456&fbclid=AaBbCC99";
  const a=await import("./ad-attribution");
  expect(a.captureAttribution()?.source).toBe("meta_ads");
  expect(a.readAttributionPlatform()).toBe("instagram");
  const trusted=a.sanitizeAcquisitionInput(a.readAttribution());
  expect(trusted?.campaign_id).toBe("123");
  expect(trusted?.ad_id).toBe("456");
  expect(trusted?.click_id).toBe("AaBbCC99");
 });
 it("does not mistake an Instagram/Facebook organic visit for a paid conversion",async()=>{
  consent.choice="granted";
  (window as any).location.search="?fbclid=AaBbCC99";
  const a=await import("./ad-attribution");
  expect(a.captureAttribution()?.source).toBe("social_unverified");
  expect(a.readAttributionPlatform()).toBe("unknown");
  expect(a.sanitizeAcquisitionInput(a.readAttribution())?.source).toBe("social_unverified");
 });
 it("keeps the first paid campaign across a second paid link",async()=>{
  consent.choice="granted";
  (window as any).location.search="?utm_source=ig&utm_medium=paid_social&utm_campaign=first";
  const a=await import("./ad-attribution");
  a.captureAttribution();
  (window as any).location.search="?utm_source=fb&utm_medium=paid_social&utm_campaign=second";
  a.captureAttribution();
  expect(a.readAttributionPlatform()).toBe("instagram");
  expect(a.readAttribution()?.utm_campaign).toBe("first");
 });
 it("works without storage and clears remembered clicks on opt-out",async()=>{
  consent.choice="granted";
  (window as any).location.search="?utm_source=fb&utm_medium=cpc&fbclid=click12345";
  (window as any).localStorage={getItem(){throw Error("blocked")},setItem(){throw Error("blocked")},removeItem(){throw Error("blocked")}};
  (window as any).sessionStorage={getItem(){throw Error("blocked")},setItem(){throw Error("blocked")},removeItem(){throw Error("blocked")}};
  const a=await import("./ad-attribution");
  expect(a.captureAttribution()?.source).toBe("meta_ads");
  expect(a.readAttribution()?.click_id).toBe("click12345");
  consent.choice="denied";a.clearAttribution();
  expect(a.readAttribution()).toBeNull();
 });
 it("will not trust an invented paid source in signup body",async()=>{
  const a=await import("./ad-attribution");
  expect(a.sanitizeAcquisitionInput({source:"meta_ads",utm_source:"ig",advertising_consent:false})).toBeNull();
  expect(a.sanitizeAcquisitionInput({source:"meta_ads",utm_source:"ig",utm_medium:"organic",advertising_consent:true})?.source).toBe("social_unverified");
 });
});
