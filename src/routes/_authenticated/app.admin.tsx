import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/admin")({
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data: profs } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const byUser = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => { byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]); });
      return (profs ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-profiles"] }); toast.success("Papel atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Painel administrativo</h1>
      </div>
      <p className="text-sm text-muted-foreground">Gerencie usuários e permissões da plataforma.</p>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Usuário</th>
              <th className="text-left p-3 font-medium">E-mail</th>
              <th className="text-left p-3 font-medium">Papéis</th>
              <th className="text-left p-3 font-medium">Criado</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {profiles.map((p) => {
              const isAdmin = p.roles.includes("admin");
              return (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="p-3 font-medium">{p.full_name ?? "—"}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{p.email}</td>
                  <td className="p-3">
                    {p.roles.map((r: string) => <Badge key={r} variant={r === "admin" ? "default" : "outline"} className="mr-1">{r}</Badge>)}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant={isAdmin ? "outline" : "default"} onClick={() => toggleAdmin.mutate({ userId: p.id, makeAdmin: !isAdmin })}>
                      {isAdmin ? "Remover admin" : "Tornar admin"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
