import { createFileRoute } from "@tanstack/react-router";

// Stream Monitor Play (Android) was retired by the owner on 2026-11-18.
// Keep the former endpoint address as a definitive 410: no passwords,
// server identifiers, credentials or other customer data are processed.
export const Route = createFileRoute("/api/public/android/login")({
  server: {
    handlers: {
      POST: async () => Response.json(
        { ok: false, error: "stream_play_android_discontinued" },
        { status: 410, headers: { "Cache-Control": "no-store" } },
      ),
    },
  },
});
