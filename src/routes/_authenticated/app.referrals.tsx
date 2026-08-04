import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/referrals")({
  beforeLoad: () => {
    throw redirect({ to: "/app/reseller" });
  },
  component: () => null,
});
