/**
 * Configuração do aplicativo Android — camada visual/distribuição.
 * Nada aqui toca no player, login ou reprodução.
 *
 * Para publicar um novo APK basta definir as variáveis de ambiente abaixo
 * (não precisa alterar código):
 *
 *   VITE_ANDROID_APK_URL=https://cdn.exemplo.com/streammonitor-1.1.apk
 *   VITE_ANDROID_APP_VERSION=1.1.0
 *   VITE_ANDROID_APK_SIZE=24 MB
 *   VITE_ANDROID_APK_UPDATED_AT=2026-08-17
 *
 * O botão público sempre aponta para /download/android, que redireciona
 * para o APK atual. Assim o link divulgado nunca muda.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const ANDROID_APP = {
  /** Link estável divulgado para os clientes. */
  downloadPath: "/download/android",
  /** URL real do APK (vazio = "em breve"). */
  apkUrl: (env.VITE_ANDROID_APK_URL || "").trim() || null,
  version: (env.VITE_ANDROID_APP_VERSION || "").trim() || null,
  size: (env.VITE_ANDROID_APK_SIZE || "").trim() || null,
  updatedAt: (env.VITE_ANDROID_APK_UPDATED_AT || "").trim() || null,
} as const;

export function formatAppDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
