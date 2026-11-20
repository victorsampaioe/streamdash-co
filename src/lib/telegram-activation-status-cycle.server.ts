/**
 * Automatic, read-only order status notifications for paid app activations.
 *
 * Financial state lives in Cloudflare D1; this cycle only fetches a restricted
 * state feed and enqueues a deduplicated Telegram message. It NEVER charges,
 * retries supplier requests, or changes an activation's financial status.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RemoteOrder = {
  orderId: string; ownerId: string; appId: string; mac: string; status: string;
  supplierState: string; paidAtMs: number; updatedAtMs: number;
};
type Channel = { id: string; owner_id: string; target: string };
const REMOTE = "https://pagamentos.streammonitor.site/internal/telegram/pix/events";
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SPECIAL_REVIEW = "7ce8e57f-57e2-4031-9f92-e0cd1986470b";
const APP_NAMES: Record<string, string> = {
  "1704893631925x176586575932592640": "IBO PLAYER",
  "1704894163703x920138830586853900": "BOB PLAYER",
  "1704894303347x184932924313636160": "SMARTONE IPTV",
  "1747326492093x423553348487348200": "9XTREAM 4K PLAYER",
  "1704896223738x856982862427069300": "A PLUS PLAYER",
};
function esc(value: string): string {
  return value.replace(/[<>&]/g, c => ({"<": "&lt;", ">": "&gt;", "&": "&amp;"}[c] ?? c));
}
function statusMessage(o: RemoteOrder): string | null {
  if (!Number.isSafeInteger(o.paidAtMs) || o.paidAtMs <= 0) return null;
  const name = APP_NAMES[o.appId] || "Aplicativo solicitado";
  // Display only the device MAC; order ID is used internally for reconciliation/deduplication.
  const base = "📱 Aplicativo: <b>" + esc(name) + "</b>\n"
    + "📺 MAC: <code>" + esc(o.mac) + "</code>\n\n";
  if (o.status === "activated")
    return "✅ <b>STREAM MONITOR — ATIVAÇÃO CONFIRMADA</b>\n\n"
      + base + "✅ Seu aplicativo foi ativado com sucesso!";
  if (o.status === "needs_review" || o.status === "failed")
    return "⚠️ <b>STREAM MONITOR — ATIVAÇÃO EM ANÁLISE</b>\n\n"
      + base + "💰 Pagamento Pix registrado. A ativação não foi confirmada pelo fornecedor.\n"
      + "Nossa equipe precisa analisar este pedido. Não pague nem ative novamente o mesmo MAC enquanto ele estiver em análise.";
  if (o.status === "paid_pending_activation" && o.supplierState === "accepted")
    return "📨 <b>STREAM MONITOR — SOLICITAÇÃO ENVIADA</b>\n\n"
      + base + "💰 Pix confirmado. O fornecedor recebeu a solicitação de ativação.\n"
      + "Aguardando resultado definitivo. Não efetue outro pagamento.";
  if (o.status === "paid_pending_activation")
    return "💠 <b>STREAM MONITOR — PAGAMENTO CONFIRMADO</b>\n\n"
      + base + "A confirmação do Pix foi recebida. O pedido está sendo processado.\n"
      + "Você receberá uma nova mensagem quando houver resultado verificado.";
  if (o.status === "refunded")
    return "↩️ <b>STREAM MONITOR — PAGAMENTO ESTORNADO</b>\n\n"
      + base + "O pedido está registrado como estornado. Confira os detalhes no painel.";
  return null;
}
async function readOrderFeed(): Promise<RemoteOrder[]> {
  const {data: key,error}=await (supabaseAdmin as any)
    .rpc("streammonitor_telegram_activation_bridge_secret");
  if(error||typeof key!=="string"||!/^[a-f0-9]{96}$/.test(key))
    throw new Error("activation_status_bridge_unavailable");
  const response=await fetch(REMOTE,{
    method:"POST",headers:{"x-sm-telegram-bridge":key,"content-type":"application/json"},
    body:"{}",cache:"no-store",signal:AbortSignal.timeout(11000)
  });
  if(!response.ok)throw new Error("activation_status_feed_http_"+response.status);
  const data=await response.json();
  if(!Array.isArray(data?.items))throw new Error("activation_status_feed_invalid");
  return data.items.filter((x: any): x is RemoteOrder =>
    x && UUID.test(x.orderId) && UUID.test(x.ownerId) &&
    typeof x.appId==="string" && x.appId.length<=100 &&
    typeof x.mac==="string" && /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(x.mac) &&
    typeof x.status==="string" && typeof x.supplierState==="string" &&
    Number.isSafeInteger(x.paidAtMs)
  ).slice(0,200);
}
export async function enqueueActivationStatusNotifications(): Promise<{eligible:number;queued:number}> {
  const orders=await readOrderFeed();
  if(!orders.length)return{eligible:0,queued:0};
  const ownerIds=[...new Set(orders.map(x=>x.ownerId))];
  const {data:channels,error}=await supabaseAdmin.from("alert_channels")
    .select("id,owner_id,target").eq("kind","telegram").eq("enabled",true)
    .in("owner_id",ownerIds).limit(500);
  if(error)throw new Error("activation_status_channels_unavailable");
  // A chat bound to different owners must never receive any financial details.
  const byChat=new Map<string,Channel[]>();
  for(const c of (channels||[]) as Channel[]){
    const chat=String(c.target||"").trim().split(":").pop()||"";
    if(!/^[1-9]\d{4,15}$/.test(chat))continue;
    byChat.set(chat,[...(byChat.get(chat)||[]),c]);
  }
  const byOwner=new Map<string,Channel[]>();
  for(const list of byChat.values()){
    if(new Set(list.map(x=>x.owner_id)).size!==1)continue;
    const owner=list[0].owner_id;
    byOwner.set(owner,[...(byOwner.get(owner)||[]),list[0]]);
  }
  let eligible=0,queued=0;
  for(const order of orders){
    const text=statusMessage(order);if(!text)continue;
    const recipients=byOwner.get(order.ownerId)||[];
    for(const ch of recipients){
      eligible++;
      // The IBO review message has already been sent with this exact key.
      // Do not send the same alert a second time during rollout.
      const special=order.orderId===SPECIAL_REVIEW && order.status==="needs_review";
      const key=special
        ? "activation_paid_review:"+order.orderId+":v1"
        : "app_activation_status:"+order.orderId+":"+order.status+":"+order.supplierState;
      const {error:enqueueError}=await supabaseAdmin.from("telegram_outbox" as any).upsert({
        idempotency_key:key.slice(0,190),source:"app_activation_order_status",
        target:ch.target,text,status:"pending",
        attempts:0,max_attempts:7,next_attempt_at:new Date().toISOString(),
        channel_id:ch.id,alert_event:"app_activation_status",
      } as any,{onConflict:"idempotency_key",ignoreDuplicates:true});
      if(enqueueError)throw new Error("activation_status_enqueue_failed");
      queued++;
    }
  }
  return{eligible,queued};
}
