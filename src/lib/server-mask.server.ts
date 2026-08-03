import { createHash } from "crypto";

const SALT = "sm-mask-v1";

function digest(id: string) {
  return createHash("md5").update(`${id}${SALT}`).digest("hex");
}

/** ID opaco e estável para servidores de terceiros (nunca revela o ID interno). */
export function maskServerId(id: string, isMine: boolean) {
  if (isMine) return id;
  const h = digest(id);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Apelido anônimo para servidores de terceiros. */
export function maskServerName(id: string, isMine: boolean, name: string) {
  return isMine ? name : `Servidor ${digest(id).slice(0, 5).toUpperCase()}`;
}
