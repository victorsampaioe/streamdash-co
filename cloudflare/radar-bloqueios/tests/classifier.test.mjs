import test from "node:test";
import assert from "node:assert/strict";
import { classify } from "../worker.mjs";
const now=1795228800000;
const dnsOk=[
 {status:"ok",successes:5,resolvers:5},
 {status:"ok",successes:5,resolvers:5}
];
const httpUp=[{status:"up",region_code:"cf-edge"}];
const event=(source_id,network_id,observed_ms,evidence_kind,evidence_verdict,signature=null,verification="verified")=>({
 source_id,network_id,observed_ms,evidence_kind,evidence_verdict,verification,
 record_json:JSON.stringify({diagnostic_signature:signature}),expires_ms:null
});
test("DNS/HTTP normal without source evidence is only normal",()=>{
 assert.equal(classify(dnsOk,httpUp,[],null,now).status,"normal");
});
test("general service outage is not called network blocking",()=>{
 const dns=Array.from({length:3},()=>({status:"down",successes:0,resolvers:5}));
 const http=Array.from({length:3},()=>({status:"down",region_code:"cf-edge"}));
 assert.equal(classify(dns,http,[],null,now).status,"unknown");
});
test("one blocked record cannot confirm restriction",()=>{
 const ev=[event("x","isp-a",now-60000,"network_block","blocked","dns_intercept")];
 assert.notEqual(classify([],[],ev,null,now).status,"confirmed");
});
test("independent verified networks, distinct sources and reachable comparison are required",()=>{
 const ev=[
  event("src-a","isp-a",now-600000,"network_block","blocked","dns_intercept"),
  event("src-b","isp-b",now-60000,"network_block","blocked","explicit_block_page"),
  event("src-c","isp-c",now-60000,"network_reachable","reachable")
 ];
 assert.equal(classify([],[],ev,null,now).status,"confirmed");
});
test("unverified future listing does not imply risk",()=>{
 const ev=[{...event("src-a","provider",now,"future_restriction","scheduled",null,"unverified"),effective_ms:now+86400000}];
 assert.equal(classify([],[],ev,null,now).status,"unknown");
});
test("verified scheduled record produces risk, never certainty",()=>{
 const ev=[{...event("src-a","provider",now,"future_restriction","scheduled"),effective_ms:now+86400000}];
 assert.equal(classify([],[],ev,null,now).status,"risk");
});
test("post-confirmation check alone does not prove normalization",()=>{
 assert.equal(classify(dnsOk,httpUp,[],{status:"confirmed"},now).status,"unknown");
});
test("normalization needs independent reachable network reports",()=>{
 const ev=[
  event("src-a","isp-a",now-1000,"network_reachable","reachable"),
  event("src-b","isp-b",now-1000,"network_reachable","reachable")
 ];
 assert.equal(classify(dnsOk,httpUp,ev,{status:"confirmed"},now).status,"normalized");
});
