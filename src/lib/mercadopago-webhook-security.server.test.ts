import {describe,expect,it} from "vitest";
import {createHmac} from "node:crypto";
import {verifyMercadoPagoSignature} from "./mercadopago-webhook-security.server";

describe("Mercado Pago webhook signature",()=>{
 const secret="test-secret-only";
 const requestId="2e9c3248-cb02-4663-a402-0ff15d8191d8";
 const dataId="PAYMENT123";
 const timestamp="1742505638683";
 const sign=(id:string,req:string,ts:string)=>"ts="+ts+",v1="+createHmac("sha256",secret)
  .update(`id:${id.toLowerCase()};request-id:${req};ts:${ts};`).digest("hex");
 it("accepts a valid provider signature",()=>{
  expect(verifyMercadoPagoSignature({secret,requestId,dataId,signature:sign(dataId,requestId,timestamp)})).toBe(true);
 });
 it("rejects missing signature or unknown key",()=>{
  expect(verifyMercadoPagoSignature({secret,requestId,dataId,signature:null})).toBe(false);
  expect(verifyMercadoPagoSignature({secret:"other",requestId,dataId,signature:sign(dataId,requestId,timestamp)})).toBe(false);
 });
 it("rejects a modified payment identifier",()=>{
  expect(verifyMercadoPagoSignature({secret,requestId,dataId:"OTHER",signature:sign(dataId,requestId,timestamp)})).toBe(false);
 });
 it("rejects altered request ID and malformed hash",()=>{
  expect(verifyMercadoPagoSignature({secret,requestId:"tampered",dataId,signature:sign(dataId,requestId,timestamp)})).toBe(false);
  expect(verifyMercadoPagoSignature({secret,requestId,dataId,signature:"ts=x,v1=zz"})).toBe(false);
 });
});
