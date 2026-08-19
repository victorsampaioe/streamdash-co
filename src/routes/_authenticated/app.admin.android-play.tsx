import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/admin/android-play")({
  beforeLoad: async ({ context }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/app" });
  },
  component: AndroidPlayAdminPage,
});

function AndroidPlayAdminPage() {
  const { data: licenses, refetch } = useQuery({
    queryKey: ["android-play-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_licenses")
        .select("*, profiles(email, full_name)");
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("reseller_licenses")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    
    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success("Status atualizado");
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Gestão Stream Monitor Play</h1>
      <Card>
        <CardHeader>
          <CardTitle>Licenças de Revendedores</CardTitle>
          <CardDescription>Revendedores que solicitaram acesso ao app Android.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses?.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.profiles?.full_name || l.profiles?.email}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === 'active' ? 'default' : 'secondary'}>{l.status}</Badge>
                  </TableCell>
                  <TableCell>{l.expires_at ? new Date(l.expires_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="space-x-2">
                    {l.status !== 'active' && <Button size="sm" onClick={() => updateStatus(l.id, 'active')}>Ativar</Button>}
                    {l.status !== 'suspended' && <Button size="sm" variant="destructive" onClick={() => updateStatus(l.id, 'suspended')}>Suspender</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
