// Valida um chat_id do Telegram enviando uma mensagem de teste pelo bot oficial.
export async function verifyTelegramChat(rawTarget: string): Promise<{ ok: boolean; error?: string; hint?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Bot do Telegram não configurado no servidor." };

  const raw = String(rawTarget ?? "").trim();
  const chatId = raw.includes(":") ? raw.split(":").slice(-1)[0].trim() : raw;

  if (!/^-?\d{5,20}$/.test(chatId)) {
    return {
      ok: false,
      error: "Código inválido. O chat_id é somente números (ex.: 123456789).",
      hint: "Abra o @userinfobot no Telegram, envie /start e copie apenas o número do campo Id.",
    };
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        parse_mode: "HTML",
        text: "✅ <b>Telegram conectado!</b>\n\nVocê vai receber aqui os alertas e o resumo inteligente do Stream Monitor.",
      }),
    });
    const j: any = await r.json().catch(() => null);
    if (r.ok && j?.ok) return { ok: true };

    const desc = String(j?.description ?? `HTTP ${r.status}`).toLowerCase();
    if (desc.includes("chat not found")) {
      return {
        ok: false,
        error: "Chat não encontrado.",
        hint: "Abra @MonitordeFluxoBot no Telegram e envie /start. Depois confira se o número é o seu Id do @userinfobot.",
      };
    }
    if (desc.includes("blocked") || desc.includes("bot was blocked")) {
      return { ok: false, error: "Você bloqueou o bot.", hint: "Desbloqueie @MonitordeFluxoBot e envie /start novamente." };
    }
    if (desc.includes("deactivated")) {
      return { ok: false, error: "Conta do Telegram desativada.", hint: "Use outra conta e envie /start para @MonitordeFluxoBot." };
    }
    return { ok: false, error: j?.description ?? `Falha ao enviar (HTTP ${r.status})`, hint: "Envie /start para @MonitordeFluxoBot e tente de novo." };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro de rede ao falar com o Telegram." };
  }
}
