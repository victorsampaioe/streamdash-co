import { createFileRoute } from "@tanstack/react-router";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";

export const Route = createFileRoute("/_authenticated/vitrine-banner")({
  ssr: false,
  component: () => <div className="min-h-screen bg-background text-foreground"><VitrineStudio mode="banner" /></div>,
  head: () => ({ meta: [{ title: "Vitrine Banner | Stream Monitor" }, { name: "robots", content: "noindex" }] }),
});
