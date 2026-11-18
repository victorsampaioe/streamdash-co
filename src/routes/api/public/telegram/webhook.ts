import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/**
 * Webhook do bot @MonitordeFluxoBot.
 * Responde /start (e qualquer mensagem) com o chat_id do usuário,
 * para que qualquer revendedor consiga vincular o Telegram sozinho.
 */

function deriveSecret(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const billingKeyboard = {
  inline_keyboard: [
    [{text:"🧾 Minha fatura",callback_data:"billing:invoice"},{text:"💠 Gerar PIX",callback_data:"billing:pix"}],
    [{text:"🔎 Buscar conteúdo do servidor",callback_data:"catalog:start"}],
    [{text:"🔒 Pagar pelo site",url:"https://streammonitor.site/app/subscription"}],
  ],
};
const creditKeyboard = {
  inline_keyboard: [
    [{text:"🪙 10 créditos",callback_data:"billing:pix:credits_10"},
     {text:"🪙 30 créditos",callback_data:"billing:pix:credits_30"},
     {text:"🪙 50 créditos",callback_data:"billing:pix:credits_50"}],
    [{text:"🧾 Minha fatura",callback_data:"billing:invoice"},
     {text:"🔒 Outros pacotes",url:"https://streammonitor.site/app/subscription"}],
  ],
};
const PIX_CODE_PATTERN = /<b>Pix copia e cola:<\/b>\s*<code>([\s\S]*?)<\/code>/i;

// CopyTextButton is supported only for codes up to 256 characters.
// For longer codes Telegram's "Copiar mensagem" copies the full
// standalone message without any extra text or truncated characters.
function decodePixCode(encoded:string):string {
  return encoded.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim();
}

async function sendPixCodeOnly(token:string,chatId:number|string,code:string) {
  const copySupported=code.length>0 && code.length<=256;
  const payload={
    chat_id:chatId,
    text:code, // Exact PIX payload: no caption, emoji, spaces or HTML entities
    disable_web_page_preview:true,
    ...(copySupported?{
      reply_markup:{inline_keyboard:[[
        {text:"📋 Copiar código Pix",copy_text:{text:code}},
      ]]},
    }:{}),
  };
  const endpoint=`https://api.telegram.org/bot${token}/sendMessage`;
  let response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
  });
  if(!response.ok && copySupported && response.status===400){
    // Telegram can reject an unsupported copy_text keyboard. Resend the
    // entire code as one plain message so copying still works everywhere.
    response=await fetch(endpoint,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:chatId,text:code,disable_web_page_preview:true}),
    });
  }
  if(!response.ok){
    console.error("[telegram-pix] code-only delivery failed",response.status);
    throw new Error("telegram_pix_code_delivery_failed");
  }
}

async function send(token: string, chatId: number | string, text: string, withBillingKeyboard=false,
  optionalKeyboard?:{inline_keyboard:Array<Array<{text:string;callback_data:string}>>}) {
  const pixMatch=PIX_CODE_PATTERN.exec(text);
  if(pixMatch){
    const code=decodePixCode(pixMatch[1]);
    if(!code || code.length>4096)throw new Error("invalid_pix_code_length");
    const overview=text.replace(
      pixMatch[0],
      "📋 <b>Pix copia e cola pronto!</b>\n"+
      (code.length<=256
        ? "Toque em <b>Copiar código Pix</b> na próxima mensagem para copiar com um toque."
        : "A próxima mensagem contém <b>somente o código Pix</b>. Segure a mensagem e selecione <b>Copiar</b> para copiar tudo.")
    );
    await send(token,chatId,overview,withBillingKeyboard);
    await sendPixCodeOnly(token,chatId,code);
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(optionalKeyboard?{reply_markup:optionalKeyboard}:withBillingKeyboard?{reply_markup:text.includes("Escolha um pacote de créditos")?creditKeyboard:billingKeyboard}:{}) }),
  });
  if(!r.ok){
    // A malformed Telegram HTML response must not swallow a valid PIX code.
    // Retry once as plain text, without logging payment codes or API payloads.
    console.error("[telegram-webhook] HTML sendMessage failed",r.status);
    if(r.status===400){
      const plain=text.replace(/<[^>]*>/g,"")
        .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
        .slice(0,4096);
      const fallback=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:chatId,text:plain,disable_web_page_preview:true}),
      });
      if(!fallback.ok)console.error("[telegram-webhook] plain fallback failed",fallback.status);
    }
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("bot not configured", { status: 503 });

        const expected = deriveSecret(token);
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(got, expected)) {
          console.warn("[telegram-webhook] secret token inválido");
          return new Response("Unauthorized", { status: 401 });
        }

        const update: any = await request.json().catch(() => null);
        // Telegram buttons are private and tied to the same registered chat
        // verified by handleTelegramCommand. No payment is initiated for a group.
        const callback=update?.callback_query;
        if(callback){
          const callbackChat=callback.message?.chat?.id;
          const isPrivate=callback.message?.chat?.type==="private" && Number(callbackChat)>0;
          const command=callback.data==="billing:pix"?"/pix":
            callback.data==="billing:invoice"?"/fatura":
            /^billing:pix:credits_(10|30|50)$/.test(String(callback.data||""))
              ? "/pix " + String(callback.data).split("_").at(-1) : null;
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`,{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({callback_query_id:callback.id}),
          }).catch(()=>{});
          if(callback.data==="catalog:start"){
            if(isPrivate && String(callback.from?.id)===String(callbackChat)){
              try{
                const {beginCatalogBotSearch}=await import("@/lib/telegram-catalog-search.server");
                const reply=await beginCatalogBotSearch(callbackChat,"");
                await send(token,callbackChat,reply.text,false,reply.keyboard);
              }catch{
                await send(token,callbackChat,"⚠️ Pesquisa indisponível. Envie /conteudo para tentar novamente.");
              }
            }
            return Response.json({ok:true});
          }
          if(/^c[sp]:[0-9a-f-]{36}:\d{1,3}$/.test(String(callback.data||""))){
            // Telegram callback buttons carry only session IDs and array indices.
            // Always verify private-chat identity AND current server ownership.
            if(isPrivate && String(callback.from?.id)===String(callbackChat)){
              try{
                const {handleCatalogBotCallback}=await import("@/lib/telegram-catalog-search.server");
                const result=await handleCatalogBotCallback(callbackChat,String(callback.data));
                await send(token,callbackChat,result.text,false,result.keyboard);
              }catch(e){
                console.error("[telegram-catalog] callback failed",e instanceof Error?e.name:"unknown");
                await send(token,callbackChat,"⚠️ Pesquisa indisponível. Tente /conteudo novamente.");
              }
            }
            return Response.json({ok:true});
          }
          if(isPrivate && command){
            const {handleTelegramCommand}=await import("@/lib/telegram-commands.server");
            try{
              const reply=await handleTelegramCommand(callbackChat,command);
              await send(token,callbackChat,reply || "Vincule este Telegram em https://streammonitor.site/app/alerts para consultar sua fatura.",true);
            }catch{
              await send(token,callbackChat,"⚠️ Não foi possível consultar sua cobrança. Tente /fatura ou /pix novamente.",true);
            }
          }
          return Response.json({ok:true});
        }
        const msg = update?.message ?? update?.edited_message;
        const chatId = msg?.chat?.id;
        if (!chatId) return Response.json({ ok: true, ignored: true });

        const originalText=String(msg?.text??"").trim();
        const text=originalText.toLowerCase();
        const first = String(msg?.from?.first_name ?? "").trim();
        // Personal payments and invoice details are never handled inside
        // Telegram groups, supergroups or public channels.
        if(msg?.chat?.type!=="private" && /^\/(?:pix|fatura|conteudo|pesquisar)(?:\s|@|$)/.test(text)){
          await send(token,chatId,
            "🔒 <b>Fatura, Pix e busca de conteúdos somente no privado.</b>\n\n"+
            "Abra uma conversa direta com @MonitordeFluxoBot e envie /conteudo, /pix ou /fatura. "+
            "Não compartilhe dados de pagamento neste grupo.");
          return Response.json({ok:true,privateOnly:true});
        }

        // Do not log arbitrary titles, personal messages or search contents.
        console.log("[telegram-webhook] update", { chat_id: chatId, command: text.startsWith("/") ? text.split(/\s/)[0].slice(0,24) : "private_text" });

        if (text.startsWith("/start")) {
          const { COMMAND_HELP } = await import("@/lib/telegram-commands.server");
          await send(
            token,
            chatId,
            `👋 Olá${first ? `, <b>${first}</b>` : ""}! Bem-vindo ao <b>Stream Monitor</b>.\n\n` +
              `Seu código de vinculação (chat_id) é:\n\n<code>${chatId}</code>\n\n` +
              `1️⃣ Toque no número acima para copiar.\n` +
              `2️⃣ Acesse <b>streammonitor.site → Alertas</b>.\n` +
              `3️⃣ Cole o código e clique em <b>Conectar Telegram</b>.\n\n` +
              `Depois disso você recebe aqui os alertas, o resumo diário — e pode usar os comandos abaixo. ✅\n\n` +
              COMMAND_HELP,
            true,
          );
          return Response.json({ ok: true });
        }

        // Interactive catalog search: /conteudo Título, /conteudo (prompt), then
        // private free-text reply, followed by validated per-owner server buttons.
        if(msg?.chat?.type==="private" && /^\/(?:conteudo|pesquisar)(?:@\w+)?(?:\s|$)/i.test(originalText)){
          try{
            const {beginCatalogBotSearch}=await import("@/lib/telegram-catalog-search.server");
            const title=originalText.replace(/^\/(?:conteudo|pesquisar)(?:@\w+)?\s*/i,"");
            const result=await beginCatalogBotSearch(chatId,title);
            await send(token,chatId,result.text,false,result.keyboard);
          }catch(e){
            console.error("[telegram-catalog] search start failed",e instanceof Error?e.name:"unknown");
            await send(token,chatId,"⚠️ Não foi possível iniciar a pesquisa agora. Tente novamente em instantes.");
          }
          return Response.json({ok:true});
        }
        if(msg?.chat?.type==="private" && originalText && !originalText.startsWith("/")){
          try{
            const {finishPendingCatalogBotSearch}=await import("@/lib/telegram-catalog-search.server");
            const pending=await finishPendingCatalogBotSearch(chatId,originalText);
            if(pending){
              await send(token,chatId,pending.text,false,pending.keyboard);
              return Response.json({ok:true});
            }
          }catch(e){
            console.error("[telegram-catalog] pending query failed",e instanceof Error?e.name:"unknown");
            await send(token,chatId,"⚠️ Falha na pesquisa. Envie /conteudo novamente.");
            return Response.json({ok:true});
          }
        }
        const { handleTelegramCommand, COMMAND_HELP } = await import("@/lib/telegram-commands.server");
        let reply: string | null = null;
        try {
          reply = await handleTelegramCommand(chatId, text);
        } catch (e: any) {
          console.error("[telegram-webhook] erro no comando", text, e?.message);
          reply = "⚠️ Não consegui buscar esses dados agora. Tente novamente em instantes.";
        }

        await send(
          token,
          chatId,
          reply ??
            `Seu código de vinculação é:\n\n<code>${chatId}</code>\n\nCole ele em <b>streammonitor.site → Alertas</b>.\n\n${COMMAND_HELP}`,
          true,
        );


        return Response.json({ ok: true });
      },
    },
  },
});
