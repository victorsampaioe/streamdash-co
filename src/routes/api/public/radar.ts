import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/radar")({
  server: {
    handlers: {
      GET: async () => {
        const { getRadarSnapshotCached } = await import("@/lib/radar.server");
        const data = await getRadarSnapshotCached();
        return Response.json(data, {
          headers: {
            "cache-control": "public, max-age=30, s-maxage=60",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
