import { createHash } from "crypto";

const SALT = "sm-mask-v1";

function digest(id: string) {
  return createHash("md5").update(`${id}${SALT}`).digest("hex");
}

/** 
 * ID opaco e estável para servidores de terceiros (nunca revela o ID interno). 
 */
export function maskServerId(id: string, isMine: boolean) {
  if (isMine) return id;
  const h = digest(id);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** 
 * Apelido amigável para servidores de terceiros.
 * Ajustar Ranking do Radar para exibir somente nome público do servidor.
 * Proteção no backend: Nunca envia DNS, domínio, IP ou host para o frontend.
 */
export function maskServerName(id: string, isMine: boolean, name: string) {
  if (isMine) return name;
  // Exibimos o nome cadastrado se existir, caso contrário o ID mascarado
  return name || `Servidor ${digest(id).slice(0, 5).toUpperCase()}`;
}

