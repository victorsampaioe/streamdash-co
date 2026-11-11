import { createFileRoute } from "@tanstack/react-router";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";

/** Keep existing /app/divulgacao links working; the traditional banner stays the default. */
export const Route = createFileRoute("/_authenticated/app/divulgacao")({
  component: () => <VitrineStudio mode="banner" />,
  head: () => ({ meta: [{ title: "Vitrine Banner | Stream Monitor" }] }),
});
