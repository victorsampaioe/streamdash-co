/**
 * Private Telegram-to-Cloudflare Pix bridge for app activations.
 * Never sends the Asaas key or internal bridge key to clients.
 * The private Telegram chat must resolve unambiguously to one registered owner.
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveUserByChatId, esc } from "@/lib/telegram-commands.server";
import { normalizeActivationMac } from "@/lib/activation-mac";

const GATEWAY = "https://pagamentos.streammonitor.site";
const APP_ID = /^[A-Za-z0-9_-]{5,90}$/;
const ORDER_ID = /^[0-9a-f-]{36}$/i;

export type TelegramActivationPixReply = {
  text: string;
  qrImage?: string | null;
  keyboard?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
};

function errorReply(message: string): TelegramActivationPixReply {
  return {text: "⚠️ " + message};
}

async function privateFinancialRequest(path: string, ownerId: string, data: Record<string, unknown>) {
  // The RPC is SECURITY DEFINER and callable ONLY by service_role.
  const {data: key, error} = await (supabaseAdmin as any)
    .rpc("streammonitor_telegram_activation_bridge_secret");
  if (error || typeof key !== "string" || !/^[a-f0-9]{96}$/.test(key))
    throw new Error("telegram_bridge_not_configured");
  const response = await fetch(GATEWAY + path, {
    method: "POST",
    headers: {"content-type": "application/json", "x-sm-telegram-bridge": key},
    body: JSON.stringify({ownerId, ...data}),
    signal: AbortSignal.timeout(27000),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null);
  return {status: response.status, data: result};
}
function stableRequestId(chat: string, messageId: number, appId: string, mac: string): string {
  const hash = createHash("sha256")
    .update(["sm-telegram-activation-pix-v1", chat, String(messageId), appId, mac].join("|"))
    .digest("hex").slice(0, 32);
  return hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-4" + hash.slice(13, 16)
    + "-8" + hash.slice(17, 20) + "-" + hash.slice(20);
}
const asBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {style: "currency", currency: "BRL"});

export async function createTelegramActivationPix(
  chatId: string | number, botMessageId: number, messageText: string,
  appId: string, macHex: string,
): Promise<TelegramActivationPixReply> {
  const chat = String(chatId);
  if (!/^[1-9][0-9]{4,15}$/.test(chat) || !APP_ID.test(appId)
    || !/^[0-9A-F]{12}$/.test(macHex) || !Number.isSafeInteger(botMessageId))
    return errorReply("Seleção inválida. Envie /ativacaoAplicativo para começar novamente.");
  // Both identifiers MUST be present in the original bot confirmation text.
  // Reject a callback with identifiers different from that confirmation.
  const fromMessageApp = /^APP-ID:\s*([A-Za-z0-9_-]{5,90})\s*$/m.exec(messageText)?.[1];
  const fromMessageMac = /^MAC:\s*([0-9A-F:]{17})\s*$/m.exec(messageText)?.[1];
  const mac = normalizeActivationMac(macHex);
  if (fromMessageApp !== appId || !mac || fromMessageMac !== mac)
    return errorReply("Não consegui confirmar o aplicativo e o MAC desta mensagem. Inicie novamente.");
  const owner = await resolveUserByChatId(chat);
  if (!owner || !ORDER_ID.test(owner))
    return errorReply("Vincule seu Telegram à sua conta do Stream Monitor em Alertas.");
  const requestId = stableRequestId(chat, botMessageId, appId, mac);
  try {
    const result = await privateFinancialRequest("/internal/telegram/pix/create", owner, {
      appId, mac, requestId, acknowledged: true,
    });
    if (result.status >= 400)
      return errorReply("Não foi possível confirmar a emissão do Pix. Confira seus pedidos antes de tentar novamente. "
        + (typeof result.data?.error === "string" ? esc(result.data.error).slice(0, 130) : ""));
    const order = result.data;
    if (!order || !ORDER_ID.test(order.orderId)) return errorReply("Pedido sem identificador válido. Confira seus pedidos.");
    const amount = Number(order.amountCents);
    if (!Number.isSafeInteger(amount) || amount < 100)
      return errorReply("O preço retornado é inválido. Não efetue pagamento.");
    if (typeof order.pix !== "string" || order.pix.length < 40 || order.pix.length > 4096) {
      return {text: "📺 <b>Ativação localizada</b>\n\nMAC: <code>" + esc(mac) + "</code>\nValor: <b>" + asBRL(amount)
        + "</b>\nSituação: <b>" + esc(String(order.status ?? "em análise")) + "</b>\n"
        + "⚠️ Não foi apresentado um Pix para este pedido. Não gere outra cobrança antes de conferir o status.",
        keyboard: {inline_keyboard: [[{text: "🔎 Verificar pagamento", callback_data: "aa:status:" + order.orderId}]]}};
    }
    const text = "💠 <b>Pix de ativação — Stream Monitor</b>\n\n"
      + "📱 Aplicativo: <b>" + esc((/^Aplicativo:\s*(.+)$/m.exec(messageText)?.[1] ?? "selecionado").slice(0, 80)) + "</b>\n"
      + "📺 MAC: <code>" + mac + "</code>\n"
      + "💰 Valor: <b>" + asBRL(amount) + "</b>\n"
      + "<b>Pix copia e cola:</b>\n<code>" + esc(order.pix) + "</code>\n\n"
      + "✅ O pagamento será confirmado pela Asaas antes da solicitação de ativação. "
      + "Não envie comprovantes nem efetue um segundo pagamento para este pedido.";
    return {text, qrImage: typeof order.qrImage === "string" ? order.qrImage : null,
      keyboard: {inline_keyboard: [[{text: "🔎 Verificar pagamento", callback_data: "aa:status:" + order.orderId}]]}};
  } catch {
    return errorReply("Não foi possível consultar o gateway agora. Confira seus pedidos antes de tentar novamente, para não duplicar o Pix.");
  }
}
export async function checkTelegramActivationPix(chatId: string | number, orderId: string): Promise<TelegramActivationPixReply> {
  const chat = String(chatId);
  if (!ORDER_ID.test(orderId) || !/^[1-9][0-9]{4,15}$/.test(chat))
    return errorReply("Pedido inválido.");
  const owner = await resolveUserByChatId(chat);
  if (!owner) return errorReply("Seu Telegram não está vinculado à conta deste pedido.");
  try {
    const result = await privateFinancialRequest("/internal/telegram/pix/status", owner, {orderId});
    if (result.status !== 200)
      return errorReply("Não consegui consultar esse pedido. Verifique na central de ativações.");
    const o = result.data;
    const names: Record<string,string> = {
      awaiting_payment: "Aguardando pagamento",
      paid_pending_activation: "Pago; aguardando ativação",
      activated: "Ativado",
      submitted: "Solicitado ao fornecedor",
      needs_review: "Em análise",
      cancelled: "Cancelado",
    };
    const state = names[String(o?.status)] || "Em processamento";
    const mac = typeof o?.mac === "string" && /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(o.mac)
      ? o.mac : null;
    return {text: "🔎 <b>Status da ativação</b>\n\n"
      + (mac ? "📺 MAC: <code>" + esc(mac) + "</code>\n" : "")
      + "Situação: <b>" + state + "</b>\n\n"
      + (String(o?.status) === "awaiting_payment"
          ? "⚠️ O pagamento ainda não foi confirmado. Não gere outra cobrança para o mesmo MAC."
          : "Confira também o histórico no painel do Stream Monitor."),
      keyboard: {inline_keyboard: [[{text: "🔄 Atualizar status", callback_data: "aa:status:" + orderId}]]}};
  } catch {
    return errorReply("Consulta indisponível no momento. O pedido permanece registrado.");
  }
}
