import {describe,it,expect} from "vitest";
import worker,{verifyStageSession} from "./worker.mjs";

const url="https://private-worker.invalid";
const id="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const sid="11111111-2222-4333-8444-555555555555";
const key="test-only-secret-do-not-deploy-".repeat(4);
const now=Date.now();
function b64(raw){return Buffer.from(raw).toString("base64url")}
async function token(payload={}){
 const h=b64(JSON.stringify({alg:"HS256",typ:"JWT"}));
 const p=b64(JSON.stringify({iss:"streammonitor-cloudflare-auth",
 aud:"streammonitor-core-stage",sub:id,sid,iat:Math.floor(now/1000),
 exp:Math.floor(now/1000)+600,...payload}));
 const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(h+"."+p));
 return h+"."+p+"."+Buffer.from(signature).toString("base64url");
}
function db(){
 const queries=[];
 const obj={queries,prepare(sql){
  const op={bind(...args){queries.push({sql,args});return{
    first:async()=>sql.includes("migration_cutover_control")?{enabled:0}
       :sql.includes("migration_auth_sessions_stage")?
        {user_id:id,expires_at:new Date(now+600_000).toISOString(),revoked_at:null}
       :sql.includes("migration_users_stage")?{user_id:id,username:"test"}:null,
    all:async()=>({results:[]})
  }}};
  return {...op,first:async()=>({enabled:0})};
 }};
 return obj;
}
describe("private staging edge API",()=>{
 it("returns no data or counts on public health",async()=>{
  const r=await worker.fetch(new Request(url+"/health"),{});
  const j=await r.json();
  expect(r.status).toBe(200);
  expect(j.login_enabled).toBe(false);
  expect(j).not.toHaveProperty("users");
 });
 it("fails closed without signing key",async()=>{
  const r=await worker.fetch(new Request(url+"/v1/profile"),{MIGRATION_DB:db()});
  expect(r.status).toBe(503);
 });
 it("rejects unsigned or tampered sessions",async()=>{
  const env={MIGRATION_DB:db(),STAGE_SESSION_SIGNING_KEY:key};
  let r=await worker.fetch(new Request(url+"/v1/profile"),env);
  expect(r.status).toBe(401);
  const good=await token();
  const bad=good.slice(0,-4)+"ABCD";
  r=await worker.fetch(new Request(url+"/v1/profile",{headers:{authorization:"Bearer "+bad}}),env);
  expect(r.status).toBe(401);
 });
 it("rejects expired sessions",async()=>{
  const env={MIGRATION_DB:db(),STAGE_SESSION_SIGNING_KEY:key};
  const v=await verifyStageSession(new Request(url,{headers:{authorization:"Bearer "+await token({exp:Math.floor(now/1000)-1})}}),env,now);
  expect(v.status).toBe(401);
 });
 it("scopes server reads to verified account only",async()=>{
  const instance=db(),env={MIGRATION_DB:instance,STAGE_SESSION_SIGNING_KEY:key};
  const r=await worker.fetch(new Request(url+"/v1/servers",{headers:{authorization:"Bearer "+await token()}}),env);
  expect(r.status).toBe(200);
  const lookup=instance.queries.find(q=>q.sql.includes("FROM migration_servers_stage"));
  expect(lookup.args[0]).toBe(id);
  expect(lookup.sql).toContain("owner_id=?");
  expect(lookup.sql).toContain("migration_shadow_tombstones");
 });
 it("blocks unapproved staging writes",async()=>{
  const r=await worker.fetch(new Request(url+"/v1/payments",{method:"POST"}),{MIGRATION_DB:db()});
  expect(r.status).toBe(405);
 });
});
