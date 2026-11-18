import {createHmac,timingSafeEqual} from "node:crypto";

/**
 * Mercado Pago Webhooks v2 validation per official signing manifest:
 * id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * Only use a secret stored on the server. Never log signature or secret.
 */
export function verifyMercadoPagoSignature(params:{
 secret:string; signature:string|null; requestId:string|null; dataId:string|null;
}):boolean {
 const {secret,signature,requestId,dataId}=params;
 if(!secret||!signature||!requestId||!dataId)return false;
 if(requestId.length>200 || dataId.length>120 || signature.length>350)return false;
 const parts=Object.fromEntries(signature.split(",").map(v=>{
  const i=v.indexOf("=");return i>0?[v.slice(0,i).trim(),v.slice(i+1).trim()]:["",""];
 }));
 const timestamp=parts.ts;
 const signed=parts.v1;
 if(!timestamp||!/^\d{10,13}$/.test(timestamp)||!signed||!/^[0-9a-f]{64}$/i.test(signed))return false;
 // The provider signs the lowercased resource identifier, not a URL-decoded
 // form invented from user-controlled body fields.
 const manifest=`id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
 const expected=createHmac("sha256",secret).update(manifest).digest("hex");
 const actualBuffer=Buffer.from(signed,"hex");
 const expectedBuffer=Buffer.from(expected,"hex");
 return actualBuffer.length===expectedBuffer.length &&
  timingSafeEqual(actualBuffer,expectedBuffer);
}
