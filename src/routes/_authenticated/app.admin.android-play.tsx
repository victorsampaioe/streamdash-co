import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, UserCheck, Clock, Ban, CheckCircle2 } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  tab: z.enum(["licenses", "requests"]).optional().default("licenses"),
});

export const Route = createFileRoute("/_authenticated/app/admin/android-play")({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: async ({ context }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw redirect({ to: "/app" });
  },
  component: AndroidPlayAdminPage,
});

function AndroidPlayAdminPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: licenses, refetch } = useQuery({
    queryKey: ["android-play-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reseller_licenses")
        .select("*, profiles(email, full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: 'active' | 'suspended' | 'pending' | 'expired' }) => {
      const { error } = await supabase
        .from("reseller_licenses")
        .update({ 
          status, 
          updated_at: new Date().toISOString(),
          ...(status === 'active' ? { expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() } : {})
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Licença atualizada com sucesso");
      refetch();
    },
    onError: () => toast.error("Erro ao atualizar licença")
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Ativa</Badge>;
      case 'suspended': return <Badge variant="destructive">Suspensa</Badge>;
      case 'pending': return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pendente</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Stream Monitor Play
          </h1>
          <p className="text-muted-foreground mt-1">Gestão centralizada de licenças Android e Android TV.</p>
        </div>
      </div>

      <Tabs 
        value={tab} 
        onValueChange={(val) => navigate({ search: (prev: any) => ({ ...prev, tab: val as any }) })}
        className="space-y-6"
      >
        <TabsList className="bg-neutral-900 border border-white/5">
          <TabsTrigger value="licenses" className="gap-2">
            <UserCheck className="h-4 w-4" /> Licenças Ativas
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <Clock className="h-4 w-4" /> Solicitações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="licenses">
          <Card className="bg-neutral-900/50 border-white/5">
            <CardHeader>
              <CardTitle>Histórico de Licenças</CardTitle>
              <CardDescription>Revendedores com licenças processadas no sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-white/5 overflow-hidden">
                <Table>
                  <TableHeader className="bg-neutral-900">
                    <TableRow>
                      <TableHead>Revendedor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expiração</TableHead>
                      <TableHead>Criação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses?.filter(l => l.status !== 'pending').map((l) => (
                      <TableRow key={l.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{(l.profiles as any)?.full_name || 'Sem nome'}</span>
                            <span className="text-xs text-muted-foreground">{(l.profiles as any)?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(l.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {l.expires_at ? new Date(l.expires_at).toLocaleDateString() : 'Não definida'}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {l.status === 'suspended' ? (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                onClick={() => updateStatus.mutate({ id: l.id, status: 'active' })}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Reativar
                              </Button>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={() => updateStatus.mutate({ id: l.id, status: 'suspended' })}
                              >
                                <Ban className="h-4 w-4 mr-1" /> Suspender
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests">
          <Card className="bg-neutral-900/50 border-white/5">
            <CardHeader>
              <CardTitle>Solicitações Pendentes</CardTitle>
              <CardDescription>Novos pedidos de ativação do Stream Monitor Play.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-white/5 overflow-hidden">
                <Table>
                  <TableHeader className="bg-neutral-900">
                    <TableRow>
                      <TableHead>Revendedor</TableHead>
                      <TableHead>Data do Pedido</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses?.filter(l => l.status === 'pending').map((l) => (
                      <TableRow key={l.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{(l.profiles as any)?.full_name || 'Sem nome'}</span>
                            <span className="text-xs text-muted-foreground">{(l.profiles as any)?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(l.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => updateStatus.mutate({ id: l.id, status: 'active' })}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Ativar Licença
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => updateStatus.mutate({ id: l.id, status: 'suspended' })}
                            >
                              Recusar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}