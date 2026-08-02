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

async function send(token: string, chatId: number | string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) console.error("[telegram-webhook] sendMessage falhou", r.status, await r.text());
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
        const msg = update?.message ?? update?.edited_message;
        const chatId = msg?.chat?.id;
        if (!chatId) return Response.json({ ok: true, ignored: true });

        const text = String(msg?.text ?? "").trim().toLowerCase();
        const first = String(msg?.from?.first_name ?? "").trim();

        console.log("[telegram-webhook] update", { chat_id: chatId, text: text.slice(0, 32) });

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
          );
          return Response.json({ ok: true });
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
        );


        return Response.json({ ok: true });
      },
    },
  },
});
