import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Lock, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { evaluateMyAchievements } from "@/lib/achievements.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/achievements")({
  head: () => ({
    meta: [
      { title: "Conquistas | StreamMonitor" },
      { name: "description", content: "Desbloqueie conquistas monitorando seus servidores com StreamMonitor." },
    ],
  }),
  component: AchievementsPage,
});

type Achievement = { code: string; emoji: string; title: string; description: string };
type Unlocked = { achievement_code: string; unlocked_at: string; server_id: string | null };

function AchievementsPage() {
  const qc = useQueryClient();
  const evalFn = useServerFn(evaluateMyAchievements);

  const { data: catalog = [] } = useQuery({
    queryKey: ["achievements-catalog"],
    queryFn: async () => ((await supabase.from("achievements").select("*").order("code")).data ?? []) as Achievement[],
  });

  const { data: unlocked = [] } = useQuery({
    queryKey: ["my-achievements"],
    queryFn: async () => ((await supabase.from("user_achievements").select("achievement_code, unlocked_at, server_id")).data ?? []) as Unlocked[],
  });

  const evaluate = useMutation({
    mutationFn: () => evalFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["my-achievements"] });
      if (r.granted > 0) toast.success(`Parabéns! Você desbloqueou ${r.granted} conquista(s).`);
      else toast.info("Nenhuma nova conquista no momento. Continue monitorando!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unlockedSet = new Set(unlocked.map((u) => u.achievement_code));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" /> Conquistas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reconhecimentos automáticos pelo cuidado com sua infraestrutura.
          </p>
        </div>
        <Button onClick={() => evaluate.mutate()} disabled={evaluate.isPending}>
          <Sparkles className="h-4 w-4 mr-1" />
          {evaluate.isPending ? "Verificando..." : "Verificar agora"}
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalog.map((a) => {
          const isOn = unlockedSet.has(a.code);
          const count = unlocked.filter((u) => u.achievement_code === a.code).length;
          return (
            <Card key={a.code} className={`p-5 relative overflow-hidden ${isOn ? "border-primary/50 bg-primary/5" : "opacity-70"}`}>
              <div className="flex items-start gap-3">
                <div className={`text-4xl ${isOn ? "" : "grayscale"}`}>{a.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{a.title}</h3>
                    {!isOn && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                  {isOn && count > 1 && (
                    <div className="mt-2 text-xs text-primary font-medium">×{count} servidores</div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Total desbloqueado: <strong>{unlocked.length}</strong> · Disponível: <strong>{catalog.length}</strong>
      </p>
    </div>
  );
}
