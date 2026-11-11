import { createFileRoute } from "@tanstack/react-router";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";

export const Route = createFileRoute("/_authenticated/vitrine-ai")({
  ssr: false,
  component: () => <div className="min-h-screen bg-background text-foreground"><VitrineStudio mode="ai" /></div>,
  head: () => ({ meta: [{ title: "Vitrine IA | Stream Monitor" }, { name: "robots", content: "noindex" }] }),
});
