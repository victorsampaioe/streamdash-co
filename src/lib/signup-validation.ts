/**
 * Validações compartilhadas (frontend + backend) do cadastro.
 * IMPORTANTE: este módulo é puro — nunca confiar apenas na versão do frontend,
 * o backend executa exatamente as mesmas regras antes de criar a conta.
 */

/** Padrões claros de URL em campos que nunca deveriam conter links. */
const URL_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /\b[a-z0-9-]{2,}\.(com|net|org|br|io|xyz|info|ru|cn|site|shop|top|online|link|click|me|tk|ml|ga|cf)(\b|\/)/i,
  /<\s*a\s|\[url|href\s*=/i,
];

export function containsUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = String(value);
  return URL_PATTERNS.some((re) => re.test(v));
}

/** Remove espaços, parênteses, hífens, "+" e qualquer caractere não numérico. */
export function normalizePhone(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Telefone brasileiro: DDD + número (10-11 dígitos) ou com país 55 (12-13 dígitos).
 * Rejeita qualquer texto livre, letras ou URL.
 */
export function validatePhone(raw: string | null | undefined): ValidationResult<string> {
  const original = String(raw ?? "").trim();
  if (!original) return { ok: false, error: "Telefone inválido" };
  if (containsUrl(original)) return { ok: false, error: "Telefone inválido" };
  if (/[a-zA-Z]/.test(original)) return { ok: false, error: "Telefone inválido" };
  // Somente números e separadores comuns são aceitos como entrada
  if (!/^[\d\s()+.-]+$/.test(original)) return { ok: false, error: "Telefone inválido" };

  const digits = normalizePhone(original);
  let value = digits;
  if (value.length === 12 || value.length === 13) {
    if (!value.startsWith("55")) return { ok: false, error: "Telefone inválido" };
    value = value.slice(2);
  }
  if (value.length !== 10 && value.length !== 11) return { ok: false, error: "Telefone inválido" };
  if (/^(\d)\1+$/.test(value)) return { ok: false, error: "Telefone inválido" };
  const ddd = Number(value.slice(0, 2));
  if (ddd < 11 || ddd > 99) return { ok: false, error: "Telefone inválido" };
  return { ok: true, value: `55${value}` };
}

export function validateName(raw: string | null | undefined): ValidationResult<string> {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (value.length < 2) return { ok: false, error: "Nome inválido (mínimo 2 caracteres)" };
  if (value.length > 80) return { ok: false, error: "Nome inválido (máximo 80 caracteres)" };
  if (containsUrl(value)) return { ok: false, error: "Nome inválido" };
  if (!/[\p{L}]/u.test(value)) return { ok: false, error: "Nome inválido" };
  return { ok: true, value };
}

const EMAIL_RE = /^[^\s@;,<>"'()[\]]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function validateEmail(raw: string | null | undefined): ValidationResult<string> {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || value.length > 254) return { ok: false, error: "E-mail inválido" };
  if (/https?:\/\//i.test(value)) return { ok: false, error: "E-mail inválido" };
  if (!EMAIL_RE.test(value)) return { ok: false, error: "E-mail inválido" };
  return { ok: true, value };
}

/**
 * Indicação: somente código do sistema (letras/números), nunca URL.
 * Vazio é permitido.
 */
export function validateReferralCode(raw: string | null | undefined): ValidationResult<string | null> {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: true, value: null };
  if (containsUrl(value)) return { ok: false, error: "Código de indicação inválido" };
  if (!/^[A-Za-z0-9]{4,16}$/.test(value)) return { ok: false, error: "Código de indicação inválido" };
  return { ok: true, value: value.toUpperCase() };
}

export function validatePassword(raw: string | null | undefined): ValidationResult<string> {
  const value = String(raw ?? "");
  if (value.length < 6) return { ok: false, error: "Senha deve ter no mínimo 6 caracteres" };
  if (value.length > 128) return { ok: false, error: "Senha muito longa" };
  return { ok: true, value };
}
