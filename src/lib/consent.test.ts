import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const state=vi.hoisted(()=>({ads:null as null|"granted"|"denied",gpc:false}));
function storage(){
 const memory=new Map<string,string>();
 return {
  getItem:(key:string)=>memory.get(key)??null,
  setItem:(key:string,value:string)=>memory.set(key,value),
  removeItem:(key:string)=>memory.delete(key)
 };
}
beforeEach(()=>{
 vi.resetModules();
 const local=storage();
 vi.stubGlobal("localStorage",local);
 vi.stubGlobal("window",{
  dispatchEvent:vi.fn(),
  addEventListener:vi.fn(),
  removeEventListener:vi.fn(),
  gtag:vi.fn()
 });
 vi.stubGlobal("navigator",{globalPrivacyControl:false});
 vi.stubGlobal("location",{hostname:"streammonitor.site"});
 state.ads=null;state.gpc=false;
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()});
describe("Meta advertising permission and LGPD",()=>{
 it("does not auto-grant Meta Pixel in Brazil when consent is missing",async()=>{
  const {canTrack,readChoice}=await import("./consent");
  expect(readChoice("advertising")).toBeNull();
  expect(await canTrack("advertising")).toBe(false);
 });
 it("requires explicit marketing consent even if region does not require a general cookie banner",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("h=streammonitor.site\nloc=BR",{status:200})));
  const {canTrack}=await import("./consent");
  expect(await canTrack("advertising")).toBe(false);
 });
 it("grants after affirmative choice and denies after refusal",async()=>{
  const {canTrack,saveChoices,readChoice}=await import("./consent");
  saveChoices({advertising:"granted"});
  expect(readChoice("advertising")).toBe("granted");
  expect(await canTrack("advertising")).toBe(true);
  saveChoices({advertising:"denied"});
  expect(readChoice("advertising")).toBe("denied");
  expect(await canTrack("advertising")).toBe(false);
 });
 it("global privacy control overrides earlier marketing grant",async()=>{
  const {readChoice,saveChoices,canTrack}=await import("./consent");
  saveChoices({advertising:"granted"});
  vi.stubGlobal("navigator",{globalPrivacyControl:true});
  expect(readChoice("advertising")).toBe("denied");
  expect(await canTrack("advertising")).toBe(false);
 });
 it("does not re-prompt visitors who already refused ads",async()=>{
  const {saveChoices,needsAnswer}=await import("./consent");
  saveChoices({advertising:"denied"});
  expect(await needsAnswer(["advertising"])).toBe(false);
 });
});
