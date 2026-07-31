// Minimal DNS wire-format client over DoH (RFC 8484) for resolvers that do not
// expose the JSON API (Quad9, OpenDNS). Only what we need: A/AAAA answers + TTL.

function encodeQuery(host: string, type: number): Uint8Array {
  const labels = host.split(".").filter(Boolean);
  const nameLen = labels.reduce((a, l) => a + 1 + l.length, 0) + 1;
  const buf = new Uint8Array(12 + nameLen + 4);
  const view = new DataView(buf.buffer);
  view.setUint16(0, 0); // id 0 (required for HTTP caching)
  view.setUint16(2, 0x0120); // RD + AD bit (DNSSEC ok)
  view.setUint16(4, 1); // qdcount
  let o = 12;
  for (const l of labels) {
    buf[o++] = l.length;
    for (let i = 0; i < l.length; i++) buf[o++] = l.charCodeAt(i);
  }
  buf[o++] = 0;
  view.setUint16(o, type);
  view.setUint16(o + 2, 1); // IN
  return buf;
}

function skipName(buf: Uint8Array, offset: number): number {
  let o = offset;
  while (o < buf.length) {
    const len = buf[o];
    if (len === 0) return o + 1;
    if ((len & 0xc0) === 0xc0) return o + 2;
    o += 1 + len;
  }
  return o;
}

export type WireAnswer = { type: number; TTL: number; data: string };

export function decodeAnswers(buf: Uint8Array): { answers: WireAnswer[]; rcode: number; ad: boolean } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const flags = view.getUint16(2);
  const rcode = flags & 0x0f;
  const ad = (flags & 0x0020) !== 0;
  const qd = view.getUint16(4);
  const an = view.getUint16(6);
  let o = 12;
  for (let i = 0; i < qd; i++) o = skipName(buf, o) + 4;

  const answers: WireAnswer[] = [];
  for (let i = 0; i < an && o + 10 <= buf.length; i++) {
    o = skipName(buf, o);
    const type = view.getUint16(o);
    const ttl = view.getUint32(o + 4);
    const rdlen = view.getUint16(o + 8);
    const rd = o + 10;
    if (type === 1 && rdlen === 4) {
      answers.push({ type, TTL: ttl, data: `${buf[rd]}.${buf[rd + 1]}.${buf[rd + 2]}.${buf[rd + 3]}` });
    } else if (type === 28 && rdlen === 16) {
      const parts: string[] = [];
      for (let k = 0; k < 16; k += 2) parts.push(view.getUint16(rd + k).toString(16));
      answers.push({ type, TTL: ttl, data: parts.join(":") });
    }
    o = rd + rdlen;
  }
  return { answers, rcode, ad };
}

export async function wireQuery(
  endpoint: string,
  host: string,
  type: number,
  timeoutMs: number,
): Promise<{ ok: boolean; answers: WireAnswer[]; ad: boolean | null; error: string | null }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/dns-message", accept: "application/dns-message" },
      body: encodeQuery(host, type).slice().buffer as ArrayBuffer,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, answers: [], ad: null, error: `HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { answers, rcode, ad } = decodeAnswers(bytes);
    if (rcode === 3) return { ok: false, answers, ad, error: "NXDOMAIN" };
    if (rcode !== 0) return { ok: false, answers, ad, error: `RCODE ${rcode}` };
    return { ok: true, answers, ad, error: null };
  } catch (e) {
    return { ok: false, answers: [], ad: null, error: e instanceof Error ? e.message : "erro" };
  }
}
