import { createFileRoute } from "@tanstack/react-router";

function isAuthorized(request: Request): boolean {
  const cron = request.headers.get("x-cron-secret");
  if (cron && process.env.CRON_SECRET && cron === process.env.CRON_SECRET) return true;
  return false;
}

async function run(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("kind");
  const kind = raw === "night" || raw === "weekly" ? raw : "daily";
  const { useCore, coreApiUrl } = await import("@/lib/core-api.server");
  if (useCore()) {
    const res = await fetch(`${coreApiUrl()}/api/public/cron/digest?kind=${kind}`, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
    });
    if (res.ok) return { forwardedToCore: true, ...(await res.json()) };
    console.warn("[cron] Core indisponível para o resumo:", res.status);
  }
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
