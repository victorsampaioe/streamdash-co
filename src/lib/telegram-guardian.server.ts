import { createHash, createHmac } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Optional AI clarity for Telegram outages / recoveries. Cannot block an
 * urgent alert if Cloudflare AI, daily allowance or the app is unavailable.
 *
 * One incident/event explanation is reused for all recipients and retries.
 * DNS vs IPTV state remain explicitly distinct in the primary alert.
 */
type Event = "OFFLINE" | "ONLINE" | "UNSTABLE";
type Category = "dns" | "server";

function fallback(kind: Category, event: Event) {
  if (kind === "dns") {
    if (event === "OFFLINE") return "O DNS não está respondendo às verificações disponíveis. Isso pode afetar o acesso, mas não comprova que o serviço de vídeo esteja indisponível. Acompanhe a próxima verificação.";
    if (event === "ONLINE") return "A resolução DNS voltou a responder às verificações disponíveis. Se ainda houver falhas no aparelho, teste novamente e informe o horário ao suporte.";
    return "Há sinais de oscilação no DNS. Refaça a consulta e compare os resultados antes de alterar as configurações.";
  }
  if (event === "OFFLINE") return "As verificações indicaram indisponibilidade do servidor. Aguarde uma nova medição e, se a falha continuar, informe o fornecedor com o horário e a evidência.";
  if (event === "ONLINE") return "O servidor voltou a responder aos testes monitorados. Isso não garante que todos os canais ou filmes estejam reproduzindo; confirme no aparelho se necessário.";
  return "O servidor apresentou respostas inconsistentes. Verifique o histórico de falhas e, se possível, compare os testes em horários diferentes.";
}

function htmlEscape(s: string) {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export async function explainTelegramAlert(args: {
  serverId: string; incidentId?: string; event: Event; kind: Category;
  reason?: string; regions?: string[];
}): Promise<string> {
  const basic = fallback(args.kind, args.event);
  const secret = process.env.CRON_SECRET;
  // Auto fallback for missing credentials, never skipping the Telegram alert.
  if (!secret || args.incidentId === undefined && args.event !== "UNSTABLE") return basic;
  const stableEvent = args.incidentId ?? String(Math.floor(Date.now() / 7_200_000));
  const alertKey = createHash("sha256").update(
    [args.serverId, stableEvent, args.kind, args.event].join(":")
  ).digest("hex");
  try {
    const cached = await (supabaseAdmin.from("guardian_telegram_explanations" as any) as any)
      .select("explanation").eq("alert_key", alertKey).maybeSingle();
    if (typeof cached.data?.explanation === "string") return cached.data.explanation;

    // No hostnames, passwords, client names or IP addresses are sent.
    const context = [
      "Estado confirmado pelo sistema: " + args.event,
      "Tipo de verificação: " + (args.kind === "dns" ? "DNS" : "HTTP / servidor"),
      "Motivo registrado: " + String(args.reason ?? "Não detalhado").slice(0, 180),
      "Sondas informadas: " + (args.regions ?? []).slice(0, 4)
        .map(r => String(r).replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 35)).join(", "),
      "Orientação técnica de segurança: " + basic
    ].join("\n");
    const payload = JSON.stringify({
      kind: "alert", category: args.kind, event: args.event,
      context, dedupeKey: "tg_" + alertKey.slice(0, 56)
    });
    const timestamp = String(Date.now());
    const signature = createHmac("sha256", secret)
      .update(timestamp + "." + payload).digest("hex");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(
        "https://streammonitor-doctor-ai.victorsampaio133.workers.dev/explain-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json",
            "x-guardian-timestamp": timestamp, "x-guardian-signature": signature },
          body: payload, signal: controller.signal
        }
      );
      if (!response.ok) return basic;
      const result = await response.json() as { answer?: string };
      if (typeof result.answer !== "string" || result.answer.trim().length < 20) return basic;
      // An LLM is never allowed to redefine confirmed state. Its output is
      // supplementary plain-language guidance, not factual status.
      const explanation = result.answer.trim().slice(0, 340);
      await (supabaseAdmin.from("guardian_telegram_explanations" as any) as any)
        .upsert({ alert_key: alertKey, explanation }, { onConflict: "alert_key" });
      return explanation;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return basic;
  }
}

export function guardianAlertFooter(text: string): string {
  return "\n\n🧠 <b>Stream Guardian — Entenda o alerta</b>\n" + htmlEscape(text);
}
