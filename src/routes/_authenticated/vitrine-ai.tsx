import {PremiumVitrineGate} from "@/components/vitrine/premium-vitrine-gate";
import { createFileRoute } from "@tanstack/react-router";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";

export const Route = createFileRoute("/_authenticated/vitrine-ai")({
  ssr: false,
  component: () => <PremiumVitrineGate><div className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-7xl px-4 pt-4"><a href="/vitrine-futebol" className="inline-flex rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-300 hover:bg-blue-500/20">⚽ Abrir Vitrine Futebol automática</a></div><VitrineStudio mode="ai" /></div></PremiumVitrineGate>,
  head: () => ({ meta: [{ title: "Vitrine IA | Stream Monitor" }, { name: "robots", content: "noindex" }] }),
});
