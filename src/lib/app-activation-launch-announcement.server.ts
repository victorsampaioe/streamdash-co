import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * One-time institutional announcement. Targets all users with an enabled
 * Telegram channel, regardless of their subscription status.
 * The unique outbox key prevents redelivery on repeated dispatcher cycles.
 */
const EVENT = "activation_apps_launch_20261120";
const ENQUEUE_DEADLINE = Date.parse("2026-11-22T03:00:00Z");
const MESSAGE = [
  "🚀 <b>STREAM MONITOR — NOVIDADE LIBERADA!</b>",
  "",
  "📲 <b>Ativação de aplicativos diretamente no nosso painel!</b>",
  "Agora você pode escolher o reprodutor, informar o MAC e solicitar o Pix em um só lugar. Após o pagamento ser confirmado, o pedido segue para ativação.",
  "",
  "⭐ <b>5 aplicativos em destaque:</b>",
  "✅ IBO PLAYER — <b>R$ 10,00</b>",
  "✅ BOB PLAYER — <b>R$ 9,90</b>",
  "✅ SMARTONE IPTV — <b>R$ 13,50</b>",
  "✅ 9XTREAM 4K PLAYER — <b>R$ 9,90</b>",
  "✅ A PLUS PLAYER — <b>R$ 8,90</b>",
  "",
  "💳 <b>Ative pelo site:</b>",
  "https://streammonitor.site/app/ativacao-aplicativos",
  "",
  "🤖 <b>Ou pelo nosso bot:</b> envie /ativacaoAplicativo",
  "",
  "🔹 Estes são apenas alguns destaques: confira os demais aplicativos e valores vigentes no painel.",
  "ℹ️ A licença ativa o reprodutor; não inclui filmes, séries, canais ou assinatura de conteúdo.",
  "",
  "Para deixar de receber comunicados pelo bot, desative o canal Telegram nas configurações de alertas.",
].join("\n");

type Channel = { id: string; owner_id: string; target: string };

export async function enqueueAppActivationLaunchOnce() {
  if (Date.now() >= ENQUEUE_DEADLINE) return { skipped: "deadline" };
  const { data: existingCampaign, error: campaignCheckError } = await supabaseAdmin.from("app_settings")
    .select("key").eq("key", EVENT).maybeSingle();
  if (campaignCheckError) throw new Error("activation_announcement_checkpoint_read_failed");
  if (existingCampaign) return { skipped: "already_queued" };
  // Honor channel opt-out, but never filter by paid, active or expired subscription.
  const targets = new Map<string, Channel>();
  for (let offset = 0; offset < 5000; offset += 250) {
    const { data, error } = await supabaseAdmin.from("alert_channels")
      .select("id,owner_id,target").eq("kind", "telegram").eq("enabled", true)
      .order("id", { ascending: true }).range(offset, offset + 249);
    if (error) throw new Error("activation_announcement_channels_unavailable");
    for (const ch of (data ?? []) as Channel[]) {
      const target = String(ch.target || "").trim();
      const chat = target.includes(":") ? target.slice(target.lastIndexOf(":") + 1) : target;
      if (!/^-?\d{5,20}$/.test(chat)) continue;
      if (!targets.has(chat)) targets.set(chat, { ...ch, target });
    }
    if ((data ?? []).length < 250) break;
  }
  if (!targets.size) return { eligible: 0, queued: 0 };
  let attempted = 0;
  for (const ch of targets.values()) {
    const chat = ch.target.includes(":")
      ? ch.target.slice(ch.target.lastIndexOf(":") + 1) : ch.target;
    const { error } = await supabaseAdmin.from("telegram_outbox" as any)
      .upsert({
        idempotency_key: `${EVENT}:${chat}`,
        source: EVENT,
        target: ch.target,
        text: MESSAGE,
        status: "pending",
        attempts: 0,
        max_attempts: 7,
        next_attempt_at: new Date().toISOString(),
        channel_id: ch.id,
        alert_event: EVENT,
        server_id: null,
        incident_id: null,
      }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) throw new Error("activation_announcement_enqueue_failed");
    attempted++;
  }
  const { error: checkpointError } = await supabaseAdmin.from("app_settings")
    .upsert({ key: EVENT, value: { eligible: targets.size, attempted, queued_at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (checkpointError) throw new Error("activation_announcement_checkpoint_write_failed");
  return { eligible: targets.size, attempted };
}
