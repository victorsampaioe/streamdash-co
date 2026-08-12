import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReactivationInfo, triggerReactivationCampaign, getReactivationHistory } from "@/lib/admin-telegram.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, History, AlertCircle, CheckCircle2, UserX, Loader2, ListRestart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

export function ReactivationPanel() {
  const getStats = useServerFn(getReactivationInfo);
  const triggerCampaign = useServerFn(triggerReactivationCampaign);
  const getHistory = useServerFn(getReactivationHistory);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["reactivation-stats"],
    queryFn: () => getStats(),
  });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["reactivation-history"],
    queryFn: () => getHistory(),
  });

  const logs = historyData?.logs || [];
  const campaigns = historyData?.campaigns || [];

  const mutation = useMutation({
    mutationFn: (manual: boolean) => triggerCampaign({ data: { manual } }),
    onSuccess: (data: any) => {
      const msg = `Campanha finalizada: ${data.sent} enviados, ${data.failed} falhas. ${data.skipped} já haviam recebido.`;
      toast.success(msg);
      refetchStats();
      refetchHistory();
    },
    onError: (e: any) => {
      toast.error(`Erro ao disparar campanha: ${e.message}`);
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchStats(), refetchHistory()]);
    setIsRefreshing(false);
    toast.info("Dados atualizados.");
  };

  const isLoading = statsLoading || historyLoading;

  if (isLoading && !stats) return <div className="p-8 text-center animate-pulse">Carregando dados de reativação...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Gestão de Reativação</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
          <Loader2 className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Atualizar Dados
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2 border-primary/20 bg-primary/5">
          <UserX className="h-8 w-8 text-primary" />
          <div>
            <div className="text-2xl font-bold">{stats?.expiredWithTelegram}</div>
            <div className="text-xs text-muted-foreground uppercase font-semibold">Expirados c/ Telegram</div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2 border-success/20 bg-success/5">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <div>
            <div className="text-2xl font-bold">{stats?.totalSent}</div>
            <div className="text-xs text-muted-foreground uppercase font-semibold">Sucessos (Último)</div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col items-center justify-center text-center space-y-2 border-destructive/20 bg-destructive/5">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div>
            <div className="text-2xl font-bold">{stats?.totalFailed}</div>
            <div className="text-xs text-muted-foreground uppercase font-semibold">Falhas (Último)</div>
          </div>
        </Card>
      </div>

      <Card className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Campanha de Reativação
            </h3>
            <p className="text-sm text-muted-foreground">
              Envie mensagens automáticas para usuários com assinatura expirada que possuem Telegram vinculado.
            </p>
          </div>
          <Button 
            onClick={() => mutation.mutate(true)} 
            disabled={mutation.isPending || stats?.expiredWithTelegram === 0}
            className="gap-2 w-full md:w-auto min-w-[200px]"
            size="lg"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando campanha...
              </>
            ) : (
              <>
                Enviar Campanha Agora
                <Send className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {stats?.lastSentAt && (
          <div className="bg-muted/50 rounded-lg p-4 border space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4 text-muted-foreground" />
                Data/Hora do último envio
              </div>
              <Badge variant="secondary">
                {format(new Date(stats.lastSentAt), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase">Mensagem enviada:</div>
              <div className="text-sm bg-background p-3 rounded border font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                {stats.lastMessage}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <ListRestart className="h-4 w-4" />
            Histórico de Campanhas
          </h4>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Data</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Resultados</th>
                  <th className="px-4 py-2 text-left font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.length > 0 ? (
                  campaigns.map((camp: any) => (
                    <tr key={camp.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        {format(new Date(camp.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={camp.status === 'completed' ? 'secondary' : camp.status === 'running' ? 'outline' : 'destructive'} className="capitalize">
                          {camp.status === 'completed' ? 'Concluída' : camp.status === 'running' ? 'Enviando...' : 'Falhou'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <span className="text-success font-medium">{camp.total_sent} ✓</span>
                          <span className="text-destructive font-medium">{camp.total_failed} ✗</span>
                          <span className="text-muted-foreground">{camp.total_skipped} -</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {camp.error_log || (camp.total_found > 0 ? `${camp.total_found} detectados` : '-')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma campanha disparada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <History className="h-4 w-4" />
            Logs Individuais (Últimos 10)
          </h4>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Usuário</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Data</th>
                  <th className="px-4 py-2 text-left font-medium">Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.length > 0 ? (
                  logs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <div className="font-medium">{log.profiles?.full_name || 'Usuário'}</div>
                        <div className="text-xs text-muted-foreground">{log.profiles?.email}</div>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'} className="capitalize">
                          {log.status === 'success' ? 'Sucesso' : 'Falha'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-2 text-xs text-destructive truncate max-w-[200px]">
                        {log.error_message || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum envio registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs text-muted-foreground bg-primary/5 p-3 rounded-md border border-primary/10">
          <strong>Regras do Sistema:</strong>
          <ul className="list-disc ml-4 mt-1 space-y-1">
            <li>Apenas usuários com status <code>expired</code> recebem.</li>
            <li>O sistema evita duplicidade automática (não envia para quem já recebeu a mensagem de sucesso).</li>
            <li>A mensagem manual utiliza o template reforçado com os novos benefícios do sistema.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
