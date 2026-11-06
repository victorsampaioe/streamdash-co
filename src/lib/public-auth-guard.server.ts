/**
 * Protections shared by interactive public authentication endpoints.
 * These routes are meant for same-origin browser requests only.
 */
export function authRequestError(request: Request): Response | null {
  const source = request.headers.get("sec-fetch-site");
  if (source === "cross-site") {
    return Response.json({ error: "Solicitação não permitida." }, {
      status: 403, headers: { "Cache-Control": "no-store" },
    });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    return Response.json({ error: "Envie os dados do formulário novamente." }, {
      status: 415, headers: { "Cache-Control": "no-store" },
    });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096) {
    return Response.json({ error: "Os dados enviados são muito grandes." }, {
      status: 413, headers: { "Cache-Control": "no-store" },
    });
  }
  return null;
}

export async function readSmallAuthJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch { return null; }
}

export function privateAuthResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
