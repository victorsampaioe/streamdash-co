/**
 * Validação de destino para requisições feitas a partir do servidor com host
 * fornecido pelo usuário (monitoramento, diagnóstico, proxy, radar).
 *
 * Objetivo: impedir SSRF contra loopback, redes privadas, link-local e
 * endpoints de metadados de nuvem — sem bloquear servidores IPTV legítimos,
 * que usam IP público em portas altas e frequentemente HTTP.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".cluster.local"];

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reservado
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    h === "::" ||
    h === "::1" ||
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80") ||
    h.startsWith("::ffff:")
  );
}

export type SsrfVerdict = { safe: true; url: URL } | { safe: false; reason: string };

/** Valida uma URL de destino informada pelo usuário. */
export function validateOutboundUrl(raw: string, opts: { allowHttp?: boolean } = {}): SsrfVerdict {
  const allowHttp = opts.allowHttp ?? true; // painéis IPTV legados ainda usam HTTP
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return { safe: false, reason: "url_invalida" };
  }

  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    return { safe: false, reason: "protocolo_nao_permitido" };
  }

  const host = url.hostname.toLowerCase();
  if (!host) return { safe: false, reason: "host_vazio" };
  if (BLOCKED_HOSTNAMES.has(host)) return { safe: false, reason: "host_interno" };
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return { safe: false, reason: "host_interno" };
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) return { safe: false, reason: "rede_privada" };
  if (url.username || url.password) return { safe: false, reason: "credencial_na_url" };

  return { safe: true, url };
}

export function isSafeOutboundUrl(raw: string, opts: { allowHttp?: boolean } = {}): boolean {
  return validateOutboundUrl(raw, opts).safe;
}

/** Só HTTPS e sem redes internas — usado para URLs de download (APK, assets). */
export function isSafeHttpsUrl(raw: string): boolean {
  return validateOutboundUrl(raw, { allowHttp: false }).safe;
}
