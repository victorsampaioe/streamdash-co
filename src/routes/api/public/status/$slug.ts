import { createFileRoute } from "@tanstack/react-router";

/** Read-only, cacheable status snapshot. No private server details exposed. */
export const Route = createFileRoute("/api/public/status/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slug = params.slug;
        if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug))
          return Response.json({ error: "not_found" }, { status: 404 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const {data, error} = await supabaseAdmin.rpc("get_public_reseller_status" as any, {_slug:slug});
          if(error) throw error;
          if(!data) return Response.json({ error: "not_found" }, {status:404,headers:{"Cache-Control":"public,max-age=0,s-maxage=15"}});
          // The RPC returns only whitelisted fields from opted-in public pages.
          return Response.json(data, {
            headers: {
              "Cache-Control": "public,max-age=15,s-maxage=30,stale-while-revalidate=30",
              "X-Content-Type-Options": "nosniff",
              "Vary": "Accept-Encoding",
            },
          });
        } catch (error) {
          console.error("[public-status] Query failed",error instanceof Error ? error.name : "unknown");
          return Response.json({error:"unavailable"}, {
            status:503,headers:{"Cache-Control":"no-store"},
          });
        }
      },
    },
  },
});
