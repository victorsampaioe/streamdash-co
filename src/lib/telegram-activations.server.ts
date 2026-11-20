/**
 * AtiveAPP Telegram storefront. App metadata is fetched from Cloudflare D1,
 * never from Lovable storage. No provider credentials, provider write calls,
 * payment debits or registration records are handled by this module.
 *
 * Telegram chat -> owner binding remains the existing verified account link
 * until the independent auth service has been migrated to Cloudflare.
 */
import { resolveUserByChatId, esc } from "@/lib/telegram-commands.server";
import { normalizeActivationMac } from "@/lib/activation-mac";

const EDGE = "https://streammonitor-app-activations.victorsampaio133.workers.dev";
const SITE = "https://streammonitor.site/app/ativacao-aplicativos";
const ID = /^[A-Za-z0-9_-]{5,90}$/;
const MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
type App = { id: string; name: string; module: string | null; priceCents: number | null };
type Keyboard = { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };
export type ActivationBotReply = { text: string; keyboard?: Keyboard };
type CatalogReply = { items: App[]; page: number; hasMore: boolean; configured: boolean; live: boolean };
const price = (n: number | null) => Number.isSafeInteger(n) && n! > 0
  ? (n! / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  : "A definir";
const cleanMac = normalizeActivationMac;
async function requestJSON(path: string): Promise<any> {
  const r = await fetch(EDGE + path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("app_catalog_service_unavailable");
  return r.json();
}
async function ownerForChat(chatId: string | number) {
  const chat = String(chatId);
  if (!/^[1-9]\d{4,15}$/.test(chat)) return null;
  return resolveUserByChatId(chat);
}
const notLinked: ActivationBotReply = { text:
  '🔒 <b>Telegram ainda não vinculado à sua conta.</b>\n\n' +
  'Conecte o chat em <a href="https://streammonitor.site/app/alerts">Stream Monitor → Alertas</a>.' };
async function appById(appId: string): Promise<App | null> {
  if (!ID.test(appId)) return null;
  try {
    const out = await requestJSON("/v1/telegram/app?id=" + encodeURIComponent(appId));
    const a: App = out?.app;
    if (!a || a.id !== appId || typeof a.name !== "string" || a.name.length > 150) return null;
    return a;
  } catch { return null; }
}
export async function beginActivationBot(
  chatId: string | number, args = "", page = 1
): Promise<ActivationBotReply> {
  if (!(await ownerForChat(chatId))) return notLinked;
  const search = args.trim().replace(/\s+/g, " ").slice(0,65);
  const normalized = Math.max(1,Math.min(40,Math.floor(page)||1));
  let catalog: CatalogReply;
  try {
    catalog = await requestJSON("/v1/telegram/catalog?page=" + normalized
      + (search ? "&q=" + encodeURIComponent(search) : ""));
  } catch {
    return { text: "⚠️ Não foi possível carregar os aplicativos na Cloudflare agora. Tente /ativacaoAplicativo novamente." };
  }
  if (!Array.isArray(catalog.items) || !catalog.items.length) {
    return { text: "📱 <b>Ativação de Aplicativos</b>\n\n"
      + (search ? "Nenhum aplicativo encontrado para <b>" + esc(search) + "</b>.\n\n"
        : "Nenhum aplicativo com preço definido pelo administrador está disponível. Consulte novamente quando mais aplicativos forem liberados.\n\n")
      + '🌐 <a href="' + SITE + '">Abrir a central no site</a>\n\n'
      + "⚠️ Sempre confira o MAC. Não há estorno por dados incorretos." };
  }
  const listed = catalog.items.filter((a: App) => ID.test(String(a.id)) && !!a.name).slice(0,8);
  const rows: Keyboard["inline_keyboard"] = listed.filter((a: App) => a.id.length <= 48)
    .map((a: App) => [{
      text: "📱 " + a.name.slice(0,38),
      callback_data: "aa:app:" + a.id,
    }]);
  const nav: Array<{ text: string; callback_data: string }> = [];
  if (normalized > 1 && !search) nav.push({ text: "◀ Anterior", callback_data: "aa:page:" + (normalized - 1) });
  if (catalog.hasMore && !search) nav.push({ text: "Próxima ▶", callback_data: "aa:page:" + (normalized + 1) });
  if (nav.length) rows.push(nav);
  const descriptions = listed.map((a: App, i: number) =>
    (i + 1) + ". <b>" + esc(a.name.slice(0,85)) + "</b> — " + esc(price(a.priceCents))
  ).join("\n");
  return {
    text: "📱 <b>Ativação de Aplicativos — Stream Monitor</b>\n\n"
      + (search ? "🔎 Busca: <b>" + esc(search) + "</b>\n\n" : "")
      + descriptions + "\n\n"
      + "👆 Toque no nome do aplicativo para ver os detalhes.\n"
      + "🔎 Buscar: <code>/ativacaoAplicativo buscar IBO</code>\n"
      + "⚠️ <b>Confira o MAC: dados errados não têm estorno.</b>\n\n"
      + (catalog.live ? "Consulte a etapa de pagamento antes da ativação." : "🛠️ Ativações pagas ainda não estão liberadas.")
      + "\n\n" + '🌐 <a href="' + SITE + '">Ver todos no site</a>',
    keyboard: rows.length ? { inline_keyboard: rows } : undefined,
  };
}
export async function activationBotCallback(chatId: string | number, data: string, messageText = ""): Promise<ActivationBotReply> {
  if (!(await ownerForChat(chatId))) return notLinked;
  const page = /^aa:page:(\d{1,2})$/.exec(data);
  if (page) return beginActivationBot(chatId, "", Number(page[1]));
  const select = /^aa:app:([A-Za-z0-9_-]{5,48})$/.exec(data);
  if (select) {
    const a = await appById(select[1]);
    if (!a) return { text: "⚠️ Este aplicativo não está disponível. Envie /ativacaoAplicativo para atualizar a lista." };
    return {
      text: "📱 <b>" + esc(a.name) + "</b>\n"
        + "💰 Valor: <b>" + esc(price(a.priceCents)) + "</b>\n\n"
        + "✅ Este aplicativo exige somente o <b>MAC</b>. Não precisa de KEY.\n"
        + "⚠️ <b>Dados errados não têm estorno.</b>\n\n"
        + "↩️ <b>Responda a ESTA mensagem apenas com o MAC do dispositivo.</b>\n"
        + "Exemplo: <code>24:FC:E5:0B:03:36</code>\n\n"
        + "APP-ID: " + esc(a.id),
    };
  }
  const confirm = /^aa:confirm:([A-Za-z0-9_-]{5,45})$/.exec(data);
  if (confirm) {
    const app = await appById(confirm[1]);
    const msgId = /^APP-ID:\s*([A-Za-z0-9_-]{5,90})$/m.exec(messageText)?.[1];
    const mac = /^MAC:\s*([A-F0-9:]{17})$/m.exec(messageText)?.[1];
    if (!app || msgId !== app.id || !mac || !MAC.test(mac))
      return { text: "⚠️ Os dados desta solicitação não puderam ser confirmados. Reinicie com /ativacaoAplicativo." };
    // CPF and payment details must only be entered in the protected site checkout.
    // Never ask users to send tax identifiers or financial data to the Telegram bot.
    return {
      text:"✅ <b>Dados conferidos</b>\n\n"+
        "📱 Aplicativo: <b>"+esc(app.name)+"</b>\n"+
        "📺 MAC: <code>"+mac+"</code>\n"+
        "💰 Preço: <b>"+esc(price(app.priceCents))+"</b>\n\n"+
        "💳 <b>O Pix é gerado com segurança no site do Stream Monitor.</b> "+
        "Entre na sua conta e confirme o app e MAC novamente.\n"+
        "⚠️ Não há cobrança por esta mensagem. Confira os dados antes de pagar.",
      keyboard:{inline_keyboard:[[{text:"🌐 Abrir pagamento no Stream Monitor",url:SITE}]]}
    };
  }
  return { text: "Menu expirado ou inválido. Envie /ativacaoAplicativo para consultar os aplicativos." };
}
/** MAC must be a direct reply to a real bot message containing the selected app ID. */
export async function reviewActivationMacReply(
  chatId: string | number, macText: string, repliedBotMessage: string
): Promise<ActivationBotReply | null> {
  const match = /^APP-ID:\s*([A-Za-z0-9_-]{5,90})$/m.exec(repliedBotMessage);
  if (!match) return null;
  if (!(await ownerForChat(chatId))) return notLinked;
  const app = await appById(match[1]);
  if (!app) return { text: "⚠️ Aplicativo inválido. Envie /ativacaoAplicativo para escolher novamente." };
  const mac = cleanMac(macText);
  if (!mac) return { text: "⚠️ <b>MAC inválido.</b>\n\nResponda novamente à mensagem do aplicativo com 12 caracteres hexadecimais. Ex.: <code>24:FC:E5:0B:03:36</code>." };
  const row = app.id.length <= 45 ? [{ text: "✅ Conferi o MAC", callback_data: "aa:confirm:" + app.id }] : [];
  return {
    text: "🔍 <b>Confira antes de ativar</b>\n\n"
      + "📱 Aplicativo: <b>" + esc(app.name) + "</b>\n"
      + "📺 MAC: <code>" + mac + "</code>\n"
      + "💰 Preço: <b>" + esc(price(app.priceCents)) + "</b>\n\n"
      + "⚠️ <b>ATENÇÃO: MAC incorreto não tem estorno.</b>\n\n"
      + "🔒 Ainda não será feita nenhuma cobrança nem ativação enquanto a integração financeira estiver pendente.\n\n"
      + "APP-ID: " + esc(app.id) + "\n"
      + "MAC: " + mac,
    keyboard: row.length ? { inline_keyboard: [row] } : undefined,
  };
}
