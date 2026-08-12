/**
 * Sanitização de mensagens de erro.
 *
 * Objetivo: nunca devolver ao navegador detalhes técnicos (SQL, nomes de
 * tabelas/colunas, hosts, chaves, stack traces, URLs internas). Mensagens
 * curtas e escritas para o usuário final são preservadas.
 */

const GENERIC_MESSAGE = "Não foi possível concluir a operação. Tente novamente em instantes.";

const LEAK_PATTERNS: RegExp[] = [
  /\b(select|insert|update|delete|drop|alter|create)\s/i,
  /row-level security|violates|constraint|duplicate key|relation |column |pg_|postgres|sqlstate|\b\d{5}\b:/i,
  /supabase|postgrest|service_role|anon key|apikey|bearer|authorization/i,
  /https?:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b|\.lovable\.app|\.supabase\.co/i,
  /at\s+\w+\s+\(|\.ts:\d+|\.js:\d+|stack|ECONN|ETIMEDOUT|ENOTFOUND|fetch failed/i,
  /password|senha=|token|secret|credential/i,
];

const MAX_SAFE_LENGTH = 180;

export function sanitizeErrorMessage(input: unknown): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? input.message
        : typeof input === "object" && input !== null && "message" in input
          ? String((input as { message: unknown }).message)
          : "";

  const message = raw.trim();
  if (!message) return GENERIC_MESSAGE;
  // Se for um erro amigável que já tratamos (como "Servidor inativo"), permite passar
  if (message.length > MAX_SAFE_LENGTH) return GENERIC_MESSAGE;
  if (message.includes("\n") && !message.includes("HTTP")) return GENERIC_MESSAGE;
  if (LEAK_PATTERNS.some((re) => re.test(message))) {
    // Exceção para mensagens de erro comuns que não vazam dados sensíveis
    const isSafeWhitelisted = [
      "Servidor inativo",
      "Credenciais ausentes",
      "HTTP 404",
      "HTTP 500",
      "HTTP 502",
      "HTTP 503",
      "HTTP 403",
      "timeout",
      "fetch failed"
    ].some(term => message.toLowerCase().includes(term.toLowerCase()));
    
    if (!isSafeWhitelisted) return GENERIC_MESSAGE;
  }

  return message;
}

export function toSafeError(error: unknown): Error {
  return new Error(sanitizeErrorMessage(error));
}

export { GENERIC_MESSAGE };
