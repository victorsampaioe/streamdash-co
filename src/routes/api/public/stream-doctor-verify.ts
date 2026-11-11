import { createFileRoute } from "@tanstack/react-router";

const fail = (status: number) =>
  Response.json({ ok: false }, { status, headers: { "Cache-Control": "no-store" } });

/** Identity verification for Cloudflare inference; never returns secrets or user data. */
export const Route = createFileRoute("/api/public/stream-doctor-verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.match(/^Bearer ([a-zA-Z0-9._-]{50,4096})$/)?.[1];
        if (!token || request.headers.get("content-length") && Number(request.headers.get("content-length")) > 100) {
          return fail(401);
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { getActiveOwnerIds } = await import("@/lib/service-status.server");
          const { data: userInfo, error } = await supabaseAdmin.auth.getUser(token);
          const uid = userInfo?.user?.id;
          if (error || !uid) return fail(401);
          if (!(await getActiveOwnerIds([uid])).has(uid)) return fail(403);
          return Response.json({ ok: true, userId: uid }, { headers: { "Cache-Control": "no-store" } });
        } catch {
          return fail(503);
        }
      }
    }
  }
});
