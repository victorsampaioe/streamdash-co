import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAdminMaster } from "@/lib/permissions";
import { VitrineFootballStudio } from "@/components/vitrine/vitrine-football-studio";

export const Route = createFileRoute("/_authenticated/app/admin_/vitrine-futebol")({
  ssr: false,
  beforeLoad: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw redirect({ to: "/auth" });
    if (isAdminMaster(user.email)) return;
    const { data: permitted, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (roleError || permitted !== true) throw redirect({ to: "/app" });
  },
  head: () => ({
    meta: [
      { title: "Vitrine IA Futebol · Admin | Stream Monitor" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: VitrineFootballStudio,
});
