/**
 * Pure, testable Telegram formatter for IPTV alert items.
 * No network / DB calls, no changes to event state or deduplication.
 * Information about catalogue additions is not labelled as a failure.
 */
export type IptvNoticeItem = {
  title: string;
  detail?: string | null;
  severity?: string;
  kind?: string;
};
export type IptvNoticeServer = {
  name: string;
  host: string;
  hasCredentials: boolean;
};
export type IptvNoticeOwner = {
  name?: string | null;
  email?: string | null;
};

type Mode = "html" | "plain";
const trim = (input: unknown, max = 700) =>
  String(input ?? "").trim().slice(0, max);

export function escapeTelegramHtml(input: unknown): string {
  return trim(input, 3000).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function markup(text: unknown, mode: Mode, kind: "bold" | "code" = "bold"): string {
  const value = trim(text, 1000);
  return mode === "plain"
    ? value
    : kind === "code"
      ? "<code>" + escapeTelegramHtml(value) + "</code>"
      : "<b>" + escapeTelegramHtml(value) + "</b>";
}
function cleanTitle(raw: string) {
  return trim(raw).replace(/^[\s📡🚨⚠️📉🎬📚📺🔥🔴🟠🟡✅]+/u, "").trim();
}
function diagnostic(item: IptvNoticeItem, mode: Mode): string {
  const title = cleanTitle(item.title);
  const detail = trim(item.detail);
  const bold = (value: string) => markup(value, mode);
  const line = (label: string, value: string) => "• " + bold(label) + " " + (mode === "html" ? escapeTelegramHtml(value) : value);
  switch (item.kind) {
    case "catalog_added":
      return "🎬 " + bold("Novos conteúdos no catálogo") +
        (detail ? "\n" + line("Adicionados:", detail) : "");
    case "catalog_removed": {
      const count = /^(\d[\d.]*)\s+conte[uú]do/i.exec(title)?.[1];
      return "📉 " + bold("Conteúdos removidos do catálogo") +
        (count ? "\n" + line("Removidos:", count + " conteúdos") : "") +
        (detail ? "\n" + line("Catálogo atual:", detail.replace(/^Total atual:\s*/i, "")) : "");
    }
    case "stream_offline": {
      const matches = detail ? detail.split(/\s*·\s*/).filter(Boolean) : [];
      const parts = ["⚠️ " + bold("Falha em stream de teste")];
      if (matches.length) {
        for (const record of matches.slice(0, 5)) {
          const normalized = record.replace(/^live\s*:\s*/i, "TV ao vivo: ")
            .replace(/^vod\s*:\s*/i, "Filme: ")
            .replace(/^series\s*:\s*/i, "Série: ");
          parts.push(line("Teste:", normalized));
        }
      }
      const codes = new Set([...detail.matchAll(/\bHTTP\s*(403|503|404|401|500)\b/gi)].map(m => m[1]));
      if (codes.has("403") || codes.has("401")) {
        parts.push("💡 Acesso negado na amostra. Pode ser bloqueio à verificação; não confirma queda geral.");
      } else if (codes.has("503")) {
        parts.push("💡 Serviço indisponível na amostra. Confirme em outras reproduções e tente novamente.");
      } else {
        parts.push("💡 Uma amostra falhou. Verifique a reprodução antes de concluir que o servidor caiu.");
      }
      return parts.join("\n");
    }
    case "health_drop": {
      const percentage = /\b(?:Health Score:?\s*)?(\d{1,3}(?:[.,]\d+)?)\s*%/i.exec(detail)?.[1];
      const lines = ["📉 " + bold("Queda de desempenho")];
      if (percentage) lines.push(line("Health Score:", percentage + "%"));
      else if (detail) lines.push(line("Detalhe:", detail));
      lines.push("💡 A pontuação indica degradação, não confirma indisponibilidade. Confira o histórico.");
      return lines.join("\n");
    }
    default:
      return (item.severity === "critical" ? "🚨 " :
        item.severity === "warning" ? "⚠️ " : "ℹ️ ") + bold(title || "Aviso do servidor") +
        (detail ? "\n" + line("Detalhe:", detail) : "");
  }
}

export function formatIptvAlertMessage(
  server: IptvNoticeServer,
  items: IptvNoticeItem[],
  options: { mode?: Mode; owner?: IptvNoticeOwner; observedAt?: Date; admin?: boolean } = {},
): string {
  const mode = options.mode ?? "html";
  const bold = (value: unknown) => markup(value, mode);
  const literal = (value: unknown) => mode === "html" ? escapeTelegramHtml(value) : trim(value);
  const important = items.filter(i => i.severity !== "info" && !/^catalog_added$/.test(i.kind ?? ""));
  const updates = items.length - important.length;
  const title = important.length
    ? "🚨 ALERTA IPTV — STREAM MONITOR"
    : "📊 ATUALIZAÇÃO IPTV — STREAM MONITOR";
  const header = [
    bold(title),
    "🖥️ " + bold("Servidor:") + " " + literal(server.name || "Sem nome"),
    (important.length && updates
      ? "⚠️ " + important.length + (important.length === 1 ? " alerta" : " alertas") +
        " • ℹ️ " + updates + (updates === 1 ? " atualização" : " atualizações")
      : items.length > 1
        ? "📌 " + items.length + " ocorrências"
        : ""),
  ].filter(Boolean).join("\n");
  const count = Math.min(items.length, 10);
  const details = items.slice(0, count).map(item => diagnostic(item, mode));
  if (items.length > count) details.push("ℹ️ Mais " + (items.length - count) + " ocorrências disponíveis no painel.");
  const footer = [
    "🌐 " + bold("Host:") + " " + markup(server.host || "Não informado", mode, "code"),
    "🔐 " + bold("IPTV:") + " " +
      (server.hasCredentials ? "Credenciais configuradas ✅" : "Credenciais não configuradas"),
  ];
  if (options.admin) {
    if (options.owner?.name) footer.push("👤 " + bold("Revenda:") + " " + literal(options.owner.name));
    if (options.owner?.email) footer.push("📧 " + bold("E-mail:") + " " + literal(options.owner.email));
  }
  const stamp = options.observedAt && Number.isFinite(options.observedAt.getTime())
    ? options.observedAt : new Date();
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone:"America/Fortaleza", day:"2-digit", month:"2-digit", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12:false,
  }).format(stamp);
  footer.push("🕒 " + bold("Verificado em:") + " " + date + " (Fortaleza)");
  return [header, ...details, "────────────\n" + footer.join("\n")].join("\n\n");
}
