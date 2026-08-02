import { createFileRoute } from "@tanstack/react-router";

function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  const apikey = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (apikey && process.env.SUPABASE_PUBLISHABLE_KEY && apikey === process.env.SUPABASE_PUBLISHABLE_KEY) return true;
  return false;
}

async function run(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("kind");
  const kind = raw === "night" || raw === "weekly" ? raw : "daily";
  const { sendDigests } = await import("@/lib/digest.server");
  return await sendDigests(kind);
}

export const Route = createFileRoute("/api/public/cron/digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try { return Response.json(await run(request)); }
        catch (e: any) { return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 }); }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("Forbidden", { status: 403 });
        try { return Response.json(await run(request)); }
        catch (e: any) { return new Response(`Error: ${e?.message ?? "unknown"}`, { status: 500 }); }
      },
    },
  },
});
