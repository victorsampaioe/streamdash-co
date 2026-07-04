import { createFileRoute } from "@tanstack/react-router";
import { AppOutletShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppOutletShell,
});
