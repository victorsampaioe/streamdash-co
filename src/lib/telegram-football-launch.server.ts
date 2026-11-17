import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FOOTBALL_3MODELS_ANNOUNCEMENT } from "./telegram-football-launch-copy";

const MAX_IMAGE_BYTES=3*1024*1024;
const TELEGRAM_TIMEOUT=25_000;
type AlbumImage={bytes:Uint8Array;mime:"image/jpeg"|"image/png";filename:string};

export function decodeLaunchImages(urls:string[]):AlbumImage[]{
  if(urls.length!==3)throw new Error("Selecione exatamente as três artes de exemplo.");
  return urls.map((url,index)=>{
    const match=/^data:(image\/jpeg|image\/png);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(url);
    if(!match)throw new Error("A arte "+(index+1)+" não é um JPEG ou PNG válido.");
    const bytes=Buffer.from(match[2],"base64");
    const mime=match[1] as AlbumImage["mime"];
    if(bytes.length<1000||bytes.length>MAX_IMAGE_BYTES)
      throw new Error("A arte "+(index+1)+" ultrapassa o limite de 3 MB ou está vazia.");
    if(mime==="image/png"&&bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")
      throw new Error("Assinatura PNG inválida.");
    if(mime==="image/jpeg"&&bytes.subarray(0,3).toString("hex")!=="ffd8ff")
      throw new Error("Assinatura JPEG inválida.");
    return {bytes:new Uint8Array(bytes),mime,
      filename:"stream-monitor-exemplo-"+(index+1)+(mime==="image/png"?".png":".jpg")};
  });
}
export function parseLaunchTarget(raw:string,defaultToken:string):{token:string;chat:string}|null{
  const target=String(raw||"").trim();
  const custom=/^(\d{5,12}:[A-Za-z0-9_-]{25,}):(-?\d{5,20}|@[A-Za-z0-9_]{5,32})$/.exec(target);
  const token=custom?.[1]||defaultToken,chat=custom?.[2]||target;
  if(!/^\d{5,12}:[A-Za-z0-9_-]{25,}$/.test(token))return null;
  if(!/^-?\d{5,20}$/.test(chat)&&!/^@[A-Za-z0-9_]{5,32}$/.test(chat))return null;
  return {token,chat};
}
async function launchRecipients(defaultToken:string){
  type Row={owner_id:string;target:string};
  const all:Row[]=[];
  for(let page=0;page<100;page++){
    const {data,error}=await supabaseAdmin.from("alert_channels")
      .select("owner_id,target").eq("kind","telegram").eq("enabled",true)
      .order("id",{ascending:true}).range(page*500,page*500+499);
    if(error)throw new Error("Não foi possível buscar os Telegram cadastrados.");
    all.push(...(data||[]));
    if((data||[]).length<500)break;
  }
  // Includes subscription-inactive owners. Never bypass a disabled Telegram
  // preference or send several times to multiple chats for the same owner.
  const owners=new Set<string>();
  const destinations:{ownerId:string;token:string;chat:string}[]=[];
  for(const row of all){
    if(!row.owner_id||owners.has(row.owner_id))continue;
    const selected=parseLaunchTarget(row.target,defaultToken);
    if(!selected)continue;
    owners.add(row.owner_id);
    destinations.push({ownerId:row.owner_id,...selected});
  }
  return {totalChannels:all.length,destinations};
}
export async function sendThreeFootballExamplesToRegisteredTelegram(
  images:AlbumImage[],destination:{token:string;chat:string}
):Promise<void>{
  const form=new FormData();
  form.append("chat_id",destination.chat);
  const media=images.map((image,index)=>({
    type:"photo",
    media:"attach://photo"+index,
    ...(index===0?{caption:FOOTBALL_3MODELS_ANNOUNCEMENT,parse_mode:"HTML"}:{}),
  }));
  form.append("media",JSON.stringify(media));
  images.forEach((image,index)=>form.append("photo"+index,
    new Blob([new Uint8Array(image.bytes)],{type:image.mime}),image.filename));
  const response=await fetch(
    "https://api.telegram.org/bot"+destination.token+"/sendMediaGroup",
    {method:"POST",body:form,signal:AbortSignal.timeout(TELEGRAM_TIMEOUT)}
  );
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.ok!==true)
    throw new Error("Telegram recusou o álbum (HTTP "+response.status+").");
}
export async function broadcastFootballLaunchAlbum(photos:string[]){
  const images=decodeLaunchImages(photos);
  const token=process.env.TELEGRAM_BOT_TOKEN||"";
  if(!/^\d{5,12}:[A-Za-z0-9_-]{25,}$/.test(token))
    throw new Error("Bot Telegram não está configurado no servidor.");
  const {totalChannels,destinations}=await launchRecipients(token);
  if(!destinations.length) return {total:0,sent:0,failed:0,totalChannels,errors:[]};
  const {runPool}=await import("./pool");
  let sent=0,failed=0;
  const errors:string[]=[];
  await runPool(destinations,async target=>{
    try{
      await sendThreeFootballExamplesToRegisteredTelegram(images,target);
      sent++;
    }catch(e){
      failed++;
      if(errors.length<10)errors.push(e instanceof Error?e.message:"Falha na entrega do álbum");
    }
  },{concurrency:3,jitterMs:450});
  return {total:destinations.length,sent,failed,totalChannels,errors};
}
