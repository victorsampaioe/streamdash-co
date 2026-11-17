import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePaidFeature } from "@/lib/premium-feature-access";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PNG_WIDTH=1080;
const MAX_PNG_BYTES=9*1024*1024; // Telegram sendPhoto accepts up to 10 MB.
const MAX_DATA_URL_CHARS=12_600_000;
const sentRecently=new Map<string,number>();

/** Telegram targets belong to the reseller's enabled alert_channels only.
 * Never accept arbitrary chat IDs, bot tokens or destinations from the browser.
 */
export function parseRegisteredTelegramTarget(raw:string,defaultToken:string){
  const target=String(raw||"").trim();
  const botOverride=/^([0-9]{5,12}:[A-Za-z0-9_-]{25,}):(-?[0-9]{5,20}|@[A-Za-z0-9_]{5,32})$/.exec(target);
  const token=botOverride?.[1]||defaultToken;
  const chat=botOverride?.[2]||target;
  if(!/^[0-9]{5,12}:[A-Za-z0-9_-]{25,}$/.test(token))return null;
  if(!/^-?[0-9]{5,20}$/.test(chat) &&
    !/^@[A-Za-z0-9_]{5,32}$/.test(chat))return null;
  if(chat.startsWith("-") && !/^-100[0-9]{7,17}$/.test(chat) && !/^-[0-9]{5,20}$/.test(chat))return null;
  return {token,chat};
}

export function validateFootballPosterDataUrl(dataUrl:string):Buffer{
  if(!dataUrl.startsWith("data:image/png;base64,"))throw new Error("Envie uma imagem PNG.");
  const encoded=dataUrl.slice("data:image/png;base64,".length);
  if(encoded.length>MAX_DATA_URL_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)){
    throw new Error("O PNG é grande demais ou inválido.");
  }
  const png=Buffer.from(encoded,"base64");
  if(png.length<1000 || png.length>MAX_PNG_BYTES ||
     png.subarray(0,8).toString("hex")!=="89504e470d0a1a0a" ||
     png.toString("ascii",12,16)!=="IHDR" ||
     png.readUInt32BE(16)!==PNG_WIDTH || png.readUInt32BE(20)!==PNG_WIDTH){
    throw new Error("Não foi possível validar a arte completa em 1080 × 1080.");
  }
  return png;
}

export const sendVitrineFootballToRegisteredTelegram=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((raw:unknown)=>z.object({
    pngDataUrl:z.string().min(1000).max(MAX_DATA_URL_CHARS),
    date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(raw))
  .handler(async({data,context})=>{
    await requirePaidFeature(context);

    const {data:channels,error}=await supabaseAdmin.from("alert_channels")
      .select("id,owner_id,target,enabled")
      .eq("owner_id",context.userId)
      .eq("kind","telegram")
      .eq("enabled",true)
      .limit(20);
    if(error)throw new Error("Não foi possível consultar seu Telegram cadastrado.");
    const valid=(channels||[])
      .map(channel=>({channel,recipient:parseRegisteredTelegramTarget(
        String(channel.target||""),process.env.TELEGRAM_BOT_TOKEN||""
      )}))
      .filter(item=>item.recipient!==null);
    if(!valid.length){
      throw new Error("Nenhum Telegram ativo foi encontrado. Cadastre e ative seu Telegram em Alertas.");
    }
    // Prefer a personal Telegram when registered, otherwise use the first
    // configured group/channel. Never broadcast to unrelated customers.
    const chosen=valid.find(item=>/^[0-9]+$/.test(item.recipient!.chat))||valid[0];
    const destination=chosen.recipient!;
    const image=validateFootballPosterDataUrl(data.pngDataUrl);

    // Best-effort protection against double taps / repeated identical requests.
    // Cross-instance throttling is enforced separately by application protections.
    const now=Date.now();
    const key=context.userId+":"+data.date;
    if(sentRecently.get(key) && now-(sentRecently.get(key)||0)<9000){
      throw new Error("A arte já foi enviada recentemente. Evite envios repetidos.");
    }
    sentRecently.set(key,now);
    const body=new FormData();
    body.append("chat_id",destination.chat);
    body.append("caption","⚽ Eventos de hoje • Stream Monitor\nConfira os jogos, horários e transmissões.\n📅 "+data.date.split("-").reverse().join("/"));
    body.append("photo",new Blob([new Uint8Array(image)],{type:"image/png"}),
      "stream-monitor-futebol-"+data.date+".png");

    try{
      const response=await fetch("https://api.telegram.org/bot"+destination.token+"/sendPhoto",{
        method:"POST",body,signal:AbortSignal.timeout(25000)
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok || result?.ok!==true){
        if(response.status===403 || response.status===400){
          throw new Error("O bot não conseguiu enviar a foto. Inicie o bot no Telegram ou libere o envio de imagens no grupo/canal cadastrado.");
        }
        if(response.status===429)throw new Error("Telegram limitou os envios. Tente novamente mais tarde.");
        throw new Error("Telegram recusou o envio. Confira o Telegram cadastrado e tente novamente.");
      }
      return {ok:true,delivered:1};
    }catch(error){
      sentRecently.delete(key);
      if(error instanceof Error && (
        error.message.startsWith("O bot")||error.message.startsWith("Telegram ")
      ))throw error;
      throw new Error("Não foi possível entregar a imagem ao Telegram cadastrado. Tente novamente.");
    }
  });
