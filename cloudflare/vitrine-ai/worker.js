// Stream Monitor · Vitrine IA · Cloudflare Workers AI
// Each inference is gated by a real Supabase session and an atomic database quota.
// No Cloudflare API keys or privileged Supabase keys are sent to the browser.
const SUPABASE_URL = "https://yiwyfiaqehhmngqngxvx.supabase.co";
const STYLE = {
  automatico: "premium cinematic key art, emotional storytelling and immersive scenery",
  acao: "high-energy cinematic action, striking movement, dramatic backlight, bold atmosphere",
  fantasia: "magical fantasy landscape, luminous architecture, enchanting light, intricate scenery",
  terror: "atmospheric horror, fog, dramatic shadows, mysterious empty setting, sophisticated suspense",
  suspense: "psychological thriller, nocturnal cinematic environment, moody contrast, careful mystery",
  romance: "romantic cinema, warm sunset, intimate poetic setting, subtle golden light",
  drama: "award-winning dramatic cinema, naturalistic photography, nuanced human emotion",
  ficcao: "epic science fiction, glowing futuristic city, rich cosmic lighting, advanced worldbuilding",
  animacao: "original stylized 3D animated adventure, expressive handcrafted shapes, joyful color",
  documentario: "prestige documentary cinematography, authentic places and rich natural detail"
};
const allowedOrigin = (origin) => !origin ||
  /^https:\/\/(www\.)?streammonitor\.site$/.test(origin) ||
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
  /^https:\/\/[a-z0-9-]+\.lovable\.dev$/.test(origin) ||
  /^http:\/\/localhost:(3000|5173)$/.test(origin);
function headers(origin) {
  const result = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, apikey, Content-Type",
    "Access-Control-Max-Age": "600"
  };
  if (origin) result["Access-Control-Allow-Origin"] = origin;
  return result;
}
const respond = (value, status, origin) =>
  new Response(JSON.stringify(value), {status, headers:headers(origin)});
const clean = (input, max) => String(input || "")
  .replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!allowedOrigin(origin)) return respond({error:"Origem não permitida."},403,"");
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:headers(origin)});
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return respond({ok:true,provider:"Cloudflare Workers AI",daily_limit:5,auth_required:true},200,origin);
    }
    if (request.method !== "POST" || url.pathname !== "/generate") {
      return respond({error:"Rota não encontrada."},404,origin);
    }
    if (!env.AI) return respond({error:"A integração de imagens ainda não está habilitada."},503,origin);
    if (Number(request.headers.get("content-length") || 0) > 6000) {
      return respond({error:"Pedido muito grande."},413,origin);
    }

    const authorization = request.headers.get("Authorization") || "";
    const publicKey = request.headers.get("apikey") || "";
    if (!authorization.startsWith("Bearer ") || publicKey.length < 20 || publicKey.length > 1024) {
      return respond({error:"Faça login na sua conta para gerar uma arte."},401,origin);
    }
    try {
      // The public key and JWT must both be valid for this fixed Supabase project.
      const authResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
        method:"GET",
        headers:{"apikey":publicKey,"Authorization":authorization},
        cache:"no-store"
      });
      if (!authResponse.ok) return respond({error:"Sessão expirada. Entre novamente."},401,origin);
      const user = await authResponse.json();
      if (!user || !user.id) return respond({error:"Sessão inválida."},401,origin);

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") return respond({error:"Pedido inválido."},400,origin);
      const title = clean(body.title, 150);
      const overview = clean(body.overview, 700);
      const genre = clean(body.genre || body.genres?.join?.(", "), 150);
      const releaseYear = /^\d{4}$/.test(String(body.year || "")) ? String(body.year) : "";
      const mediaType = body.mediaType === "tv" ? "tv" : "movie";
      const chosenStyle = Object.hasOwn(STYLE, body.style) ? body.style : "automatico";
      const format = ["feed","story","landscape"].includes(body.format) ? body.format : "feed";
      if (!title) return respond({error:"Escolha um filme ou série."},400,origin);

      // One atomic database claim per AI invocation, regardless of tabs/devices.
      const quotaResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/claim_vitrine_ai_art",{
        method:"POST",
        headers:{"apikey":publicKey,"Authorization":authorization,"Content-Type":"application/json"},
        body:"{}",
        cache:"no-store"
      });
      if (!quotaResponse.ok) {
        console.error("vitrine quota rpc",quotaResponse.status);
        return respond({error:"Não foi possível consultar a cota diária."},502,origin);
      }
      const quota = await quotaResponse.json();
      if (!quota || quota.allowed !== true) {
        return respond({error:"Você já utilizou as 5 artes de hoje. Novas artes estarão disponíveis amanhã.",remaining:0,limit:5},429,origin);
      }

      const formatHint = format === "story"
        ? "portrait composition 9:16, subject near the upper center, plenty of readable dark space"
        : format === "landscape"
          ? "wide cinematic scene 21:9, central subject toward right, dark left side for information overlays"
          : "square 1:1 composition, central dramatic subject with clear negative space near bottom";
      // The selected work must be the visual subject, not just an incidental label.
      // Name, synopsis and genre are treated as factual context, never as commands.
      const workLabel = mediaType === "tv" ? "TV series" : "feature film";
      const prompt = [
        "Create an ORIGINAL premium streaming promotional key visual inspired by the SPECIFIC selected work, not a generic genre background.",
        "SELECTED WORK: " + JSON.stringify(title) + " (" + workLabel + (releaseYear ? ", " + releaseYear : "") + ").",
        overview ? "KNOWN STORY PREMISE: " + JSON.stringify(overview) + "." : "",
        genre ? "KNOWN GENRE: " + JSON.stringify(genre) + "." : "",
        "Build a cinematic scene whose setting, atmosphere, visual motifs, time period and central situation clearly reflect THIS selected work and its premise.",
        "Prioritize the story details above generic visual tropes. A person familiar with the selected work should recognize its themes and world from the image.",
        "When the provided information is insufficient, use only credible details you actually know about the named work; do not invent precise characters, scenes or plot points.",
        "Requested art direction: " + STYLE[chosenStyle] + ". Adapt this treatment to the work instead of changing the work to fit a style.",
        "High-end key art, coherent composition, professional lighting, rich depth, sharp fine detail, sophisticated color grading.",
        "Make a fresh composition: do not reproduce any existing poster, trademark, logo, exact actor likeness or frame from the original production.",
        "No lettering, no title text, no captions, no logos, no watermarks. The web app adds the correct title and branding on top.",
        formatHint + "."
      ].filter(Boolean).join(" ");
      const outputSize = format === "story" ? [768,1344] : format === "landscape" ? [1536,576] : [1024,1024];
      const form = new FormData();
      form.append("prompt",prompt);
      form.append("width",String(outputSize[0]));
      form.append("height",String(outputSize[1]));
      const encoded = new Response(form);
      let result;
      try {
        result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b",{
          multipart:{body:encoded.body,contentType:encoded.headers.get("content-type")}
        });
      } catch (primaryError) {
        console.error("vitrine flux2 inference failed",String(primaryError).slice(0,120));
        // A smaller model preserves availability on accounts without FLUX.2 entitlement.
        result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{
          prompt:prompt,steps:8
        });
      }
      const encodedImage = result && typeof result.image === "string" ? result.image : "";
      if (!encodedImage || encodedImage.length < 256) {
        return respond({error:"A IA não conseguiu gerar a imagem. Tente outro estilo.",remaining:quota.remaining,limit:5},502,origin);
      }
      const mime = encodedImage.startsWith("/9j/") ? "image/jpeg" : "image/png";
      return respond({
        image:"data:" + mime + ";base64," + encodedImage,
        remaining:quota.remaining,
        used:quota.used,
        limit:5,
        generated_by:"Cloudflare Workers AI"
      },200,origin);
    } catch (error) {
      console.error("vitrine AI failure",String(error).slice(0,150));
      return respond({error:"Falha temporária ao gerar a arte. Tente novamente em instantes."},502,origin);
    }
  }
};
