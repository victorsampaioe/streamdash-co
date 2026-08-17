import { createHmac } from "crypto";

const CRON_SECRET = process.env.CRON_SECRET || "";
const API_URL = "http://localhost:8080";

function b64urlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signUpstream(absUrl, exp) {
  return createHmac("sha256", CRON_SECRET).update(`${absUrl}|${exp}`).digest("hex");
}

async function testHLS() {
  console.log("--- Testando Cadeia HLS via Core ---");
  
  // 1. Simular manifesto
  const manifestUrl = "http://example.com/live/user/pass/123.m3u8";
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = signUpstream(manifestUrl, exp);
  
  const proxyUrl = new URL(`${API_URL}/api/public/core/stream`);
  proxyUrl.searchParams.set("u", b64urlEncode(manifestUrl));
  proxyUrl.searchParams.set("exp", String(exp));
  proxyUrl.searchParams.set("sig", sig);
  proxyUrl.searchParams.set("type", "live");
  proxyUrl.searchParams.set("ext", "m3u8");
  proxyUrl.searchParams.set("via", "core");

  console.log(`Manifesto URL: ${proxyUrl.toString()}`);
  
  // Nota: o fetch vai falhar se o upstream não existir, mas queremos ver se o handler processa a assinatura.
  try {
    const res = await fetch(proxyUrl.toString(), { redirect: 'manual' });
    console.log(`Manifesto Status: ${res.status}`);
    console.log(`X-Core-Error: ${res.headers.get("x-core-error") || "none"}`);
    
    // Se o status for 403, a assinatura falhou ou o segredo está errado
    if (res.status === 403) {
      console.error("❌ Erro de assinatura no manifesto!");
    } else {
      console.log("✅ Assinatura do manifesto aceita (ou upstream 404/502).");
    }
  } catch (e) {
    console.log(`Fetch error (expected if upstream down): ${e.message}`);
  }

  // 2. Simular Segmento reescrito
  const segmentUrl = "http://example.com/live/user/pass/segment1.ts";
  const segSig = signUpstream(segmentUrl, exp);
  
  const segProxyUrl = new URL(`${API_URL}/api/public/core/stream`);
  segProxyUrl.searchParams.set("u", b64urlEncode(segmentUrl));
  segProxyUrl.searchParams.set("exp", String(exp));
  segProxyUrl.searchParams.set("sig", segSig);
  segProxyUrl.searchParams.set("type", "live");
  segProxyUrl.searchParams.set("ext", "ts");
  segProxyUrl.searchParams.set("via", "core");

  console.log(`\nSegmento URL: ${segProxyUrl.toString()}`);
  
  try {
    const res = await fetch(segProxyUrl.toString(), { redirect: 'manual' });
    console.log(`Segmento Status: ${res.status}`);
    console.log(`X-Core-Error: ${res.headers.get("x-core-error") || "none"}`);
    
    if (res.status === 403) {
      console.error("❌ Erro de assinatura no segmento!");
    } else {
      console.log("✅ Assinatura do segmento aceita.");
    }
  } catch (e) {
    console.log(`Fetch error: ${e.message}`);
  }
}

testHLS();
