import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibility shortcut: the protected admin panel lives at /app/admin.
// Authorization remains enforced by the destination's beforeLoad guard.
export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    throw redirect({ to: "/app/admin", replace: true });
  },
});
