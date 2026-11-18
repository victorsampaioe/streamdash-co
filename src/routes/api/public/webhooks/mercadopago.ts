import { createFileRoute } from "@tanstack/react-router";
import {clientIp,enforceRateLimits} from "@/lib/api-security.server";
import {verifyMercadoPagoSignature} from "@/lib/mercadopago-webhook-security.server";

// Mercado Pago webhook (IPN / Webhooks v2).
// URL: https://streammonitor.site/api/public/webhooks/mercadopago

async function processPayment(mpPaymentId: string) {
  const {syncMpPayment}=await import("@/lib/mercadopago.server");
  // The shared payment finalizer is responsible for the admin Telegram
  // receipt, regardless of whether webhook or customer polling wins.
  // Do not send a second, untracked admin message here.
  await syncMpPayment(mpPaymentId);
}

async function handle(request: Request) {
  const url = new URL(request.url);
  // Prevent amplification by unauthenticated callers. The provider's
  // payment API remains authoritative; request bodies never approve money.
  const ipLimit=await enforceRateLimits([
    {rule:{bucket:"mp_webhook_origin",limit:180,windowSeconds:60},
     key:clientIp(request.headers)}
  ]);
  if(ipLimit)return ipLimit;
  const declaredLength=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(declaredLength)&&declaredLength>8192)
    return new Response("payload too large",{status:413});
  let body: any = {};
  if(request.method==="POST"){
    try {
      const text=await request.text();
      if(text.length>8192)return new Response("payload too large",{status:413});
      body=text?JSON.parse(text):{};
      if(!body||typeof body!=="object"||Array.isArray(body))
        return new Response("invalid payload",{status:400});
    } catch {
      return new Response("invalid payload",{status:400});
    }
  }

  const type = url.searchParams.get("type") || body?.type || body?.topic;
  if(type&&String(type)!=="payment")
    return new Response("ignored",{status:200});
  const signedDataId=url.searchParams.get("data.id");
  const rawPaymentId=signedDataId||body?.data?.id||
    body?.resource||url.searchParams.get("id");
  const rawValue=String(rawPaymentId??"").trim();
  const idParts=rawValue.split("?")[0].split("/").filter(Boolean);
  const idCandidate=idParts[idParts.length-1]??"";
  const paymentId=/^\d{1,32}$/.test(idCandidate)?idCandidate:null;
  if(!paymentId)return new Response("invalid payment id",{status:400});

  // Optional until the merchant's Webhooks signing secret is configured:
  // enforcing a missing secret would abruptly stop existing Pix IPN receipts.
  // When configured, all POST Webhooks must have a valid HMAC signature.
  // Legacy GET IPN remains supported; it only re-fetches the actual payment
  // from Mercado Pago under the server's private access token.
  const secret=process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if(request.method==="POST"&&secret){
    const valid=verifyMercadoPagoSignature({
      secret,
      signature:request.headers.get("x-signature"),
      requestId:request.headers.get("x-request-id"),
      dataId:signedDataId,
    });
    if(!valid)return new Response("unauthorized",{status:401});
  }

  try {
    await processPayment(paymentId);
    return new Response("ok",{status:200,headers:{"Cache-Control":"no-store"}});
  } catch (e: any) {
    console.error("[mp-webhook] sync failure",e instanceof Error?e.name:"unknown");
    return new Response("payment sync failed",{status:500});
  }
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
