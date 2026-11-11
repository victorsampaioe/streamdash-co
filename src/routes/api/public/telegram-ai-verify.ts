import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica assinaturas HMAC para explicações de alertas no Cloudflare Worker.
 * Apenas confirma a origem do pedido; nenhuma credencial é devolvida.
 */
export const Route = createFileRoute("/api/public/telegram-ai-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = () => Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
        if (Number(request.headers.get("content-length") || "0") > 5000) return deny();
        const ts = request.headers.get("x-guardian-timestamp") ?? "";
        const signature = request.headers.get("x-guardian-signature") ?? "";
        const secret = process.env.CRON_SECRET;
        if (!secret || !/^\d{13}$/.test(ts) || !/^[a-f0-9]{64}$/i.test(signature)) return deny();
        if (Math.abs(Date.now() - Number(ts)) > 90_000) return deny();
        try {
          const payload = await request.text();
          if (payload.length > 4500) return deny();
          const expected = createHmac("sha256", secret).update(ts + "." + payload).digest("hex");
          if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return deny();
          const body = JSON.parse(payload);
          if (body?.kind !== "alert" || !["OFFLINE", "ONLINE", "UNSTABLE"].includes(body.event)
            || !["dns", "server"].includes(body.category)
            || typeof body.context !== "string" || body.context.length > 2500
            || typeof body.dedupeKey !== "string" || !/^[a-zA-Z0-9:_-]{10,120}$/.test(body.dedupeKey)) return deny();
          return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return deny();
        }
      }
    }
  }
});
