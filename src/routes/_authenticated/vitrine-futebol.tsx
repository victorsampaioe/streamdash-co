import { createFileRoute } from "@tanstack/react-router";
import { PremiumVitrineGate } from "@/components/vitrine/premium-vitrine-gate";
import { VitrineFootballStudio } from "@/components/vitrine/vitrine-football-studio";

export const Route = createFileRoute("/_authenticated/vitrine-futebol")({
  ssr: false,
  component: () => <PremiumVitrineGate><div className="min-h-screen bg-background text-foreground"><VitrineFootballStudio/></div></PremiumVitrineGate>,
  head: () => ({ meta: [{title:"Vitrine Futebol | Stream Monitor"},{name:"robots",content:"noindex,nofollow"}] }),
});
