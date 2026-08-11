// Server-only: criptografia simétrica (AES-256-GCM) para segredos guardados no banco.
// Chave: IPTV_ENC_KEY (secret do ambiente). Nunca exponha valores decifrados ao cliente.
const PREFIX = "enc:v1:";
const enc = new TextEncoder();
const dec = new TextDecoder();
let _key = null;
function keyMaterial() {
    const raw = process.env.IPTV_ENC_KEY;
    if (!raw)
        throw new Error("IPTV_ENC_KEY não configurada — impossível criptografar credenciais.");
    return raw;
}
async function getKey() {
    if (!_key) {
        _key = (async () => {
            const digest = await crypto.subtle.digest("SHA-256", enc.encode(keyMaterial()));
            return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
        })();
    }
    return _key;
}
function toB64(bytes) {
    let s = "";
    for (const b of bytes)
        s += String.fromCharCode(b);
    return btoa(s);
}
function fromB64(value) {
    const bin = atob(value);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++)
        out[i] = bin.charCodeAt(i);
    return out;
}
export function isEncrypted(value) {
    return typeof value === "string" && value.startsWith(PREFIX);
}
/** Criptografa um texto. Valores vazios/nulos retornam null. */
export async function encryptSecret(plain) {
    if (plain == null || plain === "")
        return null;
    if (isEncrypted(plain))
        return plain;
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
    return `${PREFIX}${toB64(iv)}.${toB64(ct)}`;
}
/** Descriptografa. Valores legados (texto puro) são devolvidos como estão. */
export async function decryptSecret(value) {
    if (value == null || value === "")
        return null;
    if (!isEncrypted(value))
        return value; // legado: ainda não migrado
    const [ivPart, ctPart] = value.slice(PREFIX.length).split(".");
    if (!ivPart || !ctPart)
        return null;
    try {
        const key = await getKey();
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivPart) }, key, fromB64(ctPart));
        return dec.decode(plain);
    }
    catch {
        console.warn("[crypto] falha ao descriptografar segredo (chave alterada?)");
        return null;
    }
}
