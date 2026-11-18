/**
 * Private Telegram bot catalog finder. Searches only cached metadata from
 * servers owned by the uniquely linked Telegram user. No Xtream requests,
 * passwords, stream URLs or third-party server data enter Telegram messages.
 */
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {resolveUserByChatId,esc} from "@/lib/telegram-commands.server";
import {listCatalogServers,searchCatalogForOwner} from "@/lib/server-catalog-search.server";
import {rateLimit} from "@/lib/api-security.server";

type Keyboard={inline_keyboard:Array<Array<{text:string;callback_data:string}>>};
export type CatalogBotReply={text:string;keyboard?:Keyboard};
const CHAT=/^[1-9][0-9]{4,15}$/;
const SESSION=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGESIZE=6;
const LINK="https://streammonitor.site/app/conteudo-servidor";
const fail=(text:string):CatalogBotReply=>({text});
const channelName=(v:string)=>v.length>35?v.slice(0,32)+"…":v;
async function identity(chatId:string|number){
 const chat=String(chatId);
 if(!CHAT.test(chat))return null;
 const ownerId=await resolveUserByChatId(chat);
 return ownerId?{chat,ownerId}:null;
}
async function available(ownerId:string){
 return listCatalogServers(ownerId);
}
async function chooser(ownerId:string,title:string,sessionId:string,page=0):Promise<CatalogBotReply>{
 const servers=await available(ownerId);
 if(!servers.length)return fail("🔒 <b>Sem servidores disponíveis para pesquisa.</b>\n\n"+
  "Você precisa ter créditos ou plano ativos, servidor Xtream com credenciais registradas e catálogo reconhecido pelo Stream Monitor.\n\n"+
  "<a href=\""+LINK+"\">Abrir Conteúdo do Servidor</a>");
 const totalPages=Math.ceil(servers.length/PAGESIZE);
 if(!Number.isInteger(page)||page<0||page>=totalPages)return fail("Menu expirado. Envie /conteudo novamente.");
 const start=page*PAGESIZE;
 const rows=servers.slice(start,start+PAGESIZE).map((srv,i)=>[{
   text:"📡 "+channelName(srv.name),
   callback_data:"cs:"+sessionId+":"+(start+i)
 }]);
 const nav:Array<{text:string;callback_data:string}>=[];
 if(page>0)nav.push({text:"◀️ Voltar",callback_data:"cp:"+sessionId+":"+(page-1)});
 if(page<totalPages-1)nav.push({text:"Próximos ▶️",callback_data:"cp:"+sessionId+":"+(page+1)});
 if(nav.length)rows.push(nav);
 return {
   text:"🔎 <b>Conteúdo do Servidor</b>\n\n"+
    "Título: <b>"+esc(title)+"</b>\n"+
    "Escolha <b>um dos seus servidores</b> para consultar o último catálogo reconhecido.\n\n"+
    "Página "+(page+1)+" de "+totalPages+" · acesso restrito à sua conta.",
   keyboard:{inline_keyboard:rows}
 };
}
export async function beginCatalogBotSearch(chatId:string|number,raw:string):Promise<CatalogBotReply>{
 const who=await identity(chatId);
 if(!who)return fail("🔒 <b>Telegram não vinculado.</b>\n\n"+
  "Conecte este chat à sua conta em https://streammonitor.site/app/alerts para pesquisar seus catálogos.");
 const limit=await rateLimit({bucket:"telegram_catalog_start",limit:12,windowSeconds:60},who.chat);
 if(!limit.allowed)return fail("⏳ Muitas pesquisas. Tente novamente daqui a um minuto.");
 const title=raw.trim().replace(/\s+/g," ").slice(0,120);
 if(!title){
  const {error}=await supabaseAdmin.from("telegram_catalog_search_sessions" as any)
   .insert({owner_id:who.ownerId,chat_id:who.chat,title:null} as any);
  if(error)throw new Error("catalog_bot_state_unavailable");
  return fail("🎬 <b>Qual filme, série ou canal você procura?</b>\n\n"+
   "Responda com o nome do conteúdo.\n\n"+
   "Exemplo: <b>Stranger Things</b>\n"+
   "Ou envie diretamente: <code>/conteudo Stranger Things</code>");
 }
 if(title.length<2)return fail("Digite pelo menos dois caracteres. Exemplo: /conteudo Titanic");
 const servers=await available(who.ownerId);
 if(!servers.length)return chooser(who.ownerId,title,"00000000-0000-0000-0000-000000000000");
 const {data:session,error}=await supabaseAdmin.from("telegram_catalog_search_sessions" as any)
  .insert({owner_id:who.ownerId,chat_id:who.chat,title} as any)
  .select("id").single();
 if(error||!session)throw new Error("catalog_bot_session_unavailable");
 return chooser(who.ownerId,title,(session as any).id);
}
/** Called only for private, non-command message after /conteudo prompt. */
export async function finishPendingCatalogBotSearch(chatId:string|number,raw:string):Promise<CatalogBotReply|null>{
 const who=await identity(chatId);
 if(!who)return null;
 const {data:session,error}=await supabaseAdmin.from("telegram_catalog_search_sessions" as any)
  .select("id").eq("owner_id",who.ownerId).eq("chat_id",who.chat).is("title",null)
  .gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(1).maybeSingle();
 if(error||!session)return null;
 const title=raw.trim().replace(/\s+/g," ").slice(0,120);
 if(title.length<2)return fail("Digite um título com pelo menos dois caracteres.");
 const {error:updateError}=await supabaseAdmin.from("telegram_catalog_search_sessions" as any)
  .update({title} as any).eq("id",(session as any).id).eq("owner_id",who.ownerId);
 if(updateError)throw new Error("catalog_bot_session_save_failed");
 return chooser(who.ownerId,title,(session as any).id);
}
export async function handleCatalogBotCallback(
 chatId:string|number,callbackData:string
):Promise<CatalogBotReply>{
 const m=/^(cs|cp):([0-9a-f-]{36}):(\d{1,3})$/.exec(callbackData);
 if(!m||!SESSION.test(m[2]))return fail("Menu inválido. Envie /conteudo para pesquisar.");
 const who=await identity(chatId);
 if(!who)return fail("🔒 Este Telegram não está vinculado à sua conta. Acesse /app/alerts.");
 const limit=await rateLimit({bucket:"telegram_catalog_button",limit:25,windowSeconds:60},who.chat);
 if(!limit.allowed)return fail("⏳ Aguarde um pouco antes de continuar.");
 const {data:session,error}=await supabaseAdmin.from("telegram_catalog_search_sessions" as any)
  .select("id,owner_id,title,expires_at")
  .eq("id",m[2]).eq("owner_id",who.ownerId).eq("chat_id",who.chat)
  .gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!session||(session as any).title===null)
  return fail("⏰ Pesquisa expirada. Envie /conteudo Título novamente.");
 const title=String((session as any).title);
 if(m[1]==="cp")return chooser(who.ownerId,title,m[2],Number(m[3]));
 const servers=await available(who.ownerId);
 const server=servers[Number(m[3])];
 if(!server)return fail("🔒 Servidor não autorizado ou indisponível. Inicie uma nova pesquisa.");
 const result=await searchCatalogForOwner(who.ownerId,server.id,title,"all");
 const suffix=result.stale?"\n\n⚠️ Catálogo com mais de 24 horas. O resultado pode ter mudado.":"";
 const detail=result.items.length?result.items.slice(0,8).map(i=>{
  const type=i.kind==="vod"?"🎬 Filme":i.kind==="series"?"📺 Série":"📡 Canal";
  return "• "+type+": <b>"+esc(i.name)+"</b>";
 }).join("\n"):"";
 const stamp=new Date(result.server.catalogSyncedAt).toLocaleString("pt-BR",{timeZone:"America/Fortaleza"});
 const responseText=(
  result.status==="found"
   ?"✅ <b>Encontrado no catálogo!</b>\n\n"+
    "🔎 <b>"+esc(title)+"</b>\n📡 Servidor: <b>"+esc(server.name)+"</b>\n\n"+
    detail+(result.limited?"\n…e outros títulos relacionados.":"")+
    "\n\n🕒 Último catálogo: "+stamp+suffix+
    "\n\n<a href=\""+LINK+"\">Abrir pesquisa completa</a>"
   :"🟡 <b>Não localizado no último catálogo reconhecido.</b>\n\n"+
    "🔎 <b>"+esc(title)+"</b>\n📡 Servidor: <b>"+esc(server.name)+"</b>\n"+
    "🕒 Último catálogo: "+stamp+
    "\n\nIsso não confirma ausência definitiva: o catálogo do servidor pode ter mudado."+suffix+
    "\n\n<a href=\""+LINK+"\">Abrir pesquisa no site</a>"
 );
 const series=result.items.filter(i=>i.kind==="series").slice(0,4);
 return {text:responseText,
  ...(series.length?{keyboard:{inline_keyboard:series.map(i=>[{
   text:"📺 Ver temporadas e episódios · "+channelName(i.name),
   callback_data:"ce:"+m[2]+":"+m[3]+":"+i.id,
  }])}}:{})};
}

/** A dedicated second tap authorizes ONE provider series-info request. */
export async function handleCatalogSeriesBotCallback(
 chatId:string|number,callbackData:string
):Promise<CatalogBotReply>{
 const m=/^ce:([0-9a-f-]{36}):(\d{1,3}):(\d{1,15})$/.exec(callbackData);
 if(!m||!SESSION.test(m[1]))return fail("Seleção inválida. Envie /conteudo novamente.");
 const who=await identity(chatId);
 if(!who)return fail("🔒 Telegram não vinculado a uma conta válida.");
 const limiter=await rateLimit({bucket:"telegram_series_tap",limit:8,windowSeconds:60},who.chat);
 if(!limiter.allowed)return fail("⏳ Muitas consultas. Tente novamente em um minuto.");
 const {data:session,error}=await supabaseAdmin.from("telegram_catalog_search_sessions" as any)
  .select("id").eq("id",m[1]).eq("owner_id",who.ownerId)
  .eq("chat_id",who.chat).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!session)return fail("⏰ Pesquisa expirada. Envie /conteudo novamente.");
 const server=(await available(who.ownerId))[Number(m[2])];
 if(!server)return fail("🔒 Servidor não autorizado ou indisponível.");
 const itemId=Number(m[3]);
 if(!Number.isSafeInteger(itemId)||itemId<=0)return fail("Série inválida.");
 const {getSeriesDetailsForOwner}=await import("@/lib/series-episodes.server");
 const details=await getSeriesDetailsForOwner(who.ownerId,server.id,itemId);
 const lines=[
  "📺 <b>"+esc(details.series.name)+"</b>",
  "📡 Servidor: <b>"+esc(server.name)+"</b>",
  "🎞️ Temporadas: <b>"+details.seasons.length+"</b> · Episódios informados: <b>"+details.episodeCount+"</b>",
  "",
 ];
 if(!details.provided){
  lines.push("⚠️ O provedor não disponibilizou temporadas ou episódios para esta série.");
 }else if(!details.seasons.length){
  lines.push("Nenhuma temporada informada pelo provedor.");
 }else{
  // Telegram is a brief confirmation. The website can display the full list.
  for(const season of details.seasons.slice(0,8)){
   lines.push("📁 <b>"+(season.number===0?"Especiais":"Temporada "+season.number)+"</b>");
   for(const episode of season.episodes.slice(0,7)){
    const ep=episode.number!==null?"Episódio "+episode.number:"Episódio sem número";
    lines.push("• "+ep+(episode.name?" — "+esc(episode.name):""));
   }
   if(!season.episodes.length)lines.push("• Lista de episódios não fornecida");
   if(season.episodes.length>7)lines.push("…e mais "+(season.episodes.length-7)+" episódios nesta temporada.");
   lines.push("");
   if(lines.join("\n").length>2800)break;
  }
  if(details.seasons.length>8||details.limited)
   lines.push("Mais temporadas ou episódios podem estar disponíveis na pesquisa completa.");
 }
 lines.push("🔒 Consulta pontual, sem compartilhar usuário, senha ou links de vídeo.");
 lines.push('<a href="'+LINK+'">Ver pesquisa completa no site</a>');
 return fail(lines.join("\n").slice(0,3900));
}

