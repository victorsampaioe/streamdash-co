import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReactivationInfo, triggerReactivationCampaign } from "@/lib/admin-telegram.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, History, AlertCircle, CheckCircle2, UserX } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ReactivationPanel() {
  const getStats = useServerFn(getReactivationInfo);
  const triggerCampaign = useServerFn(triggerReactivationCampaign);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["reactivation-stats"],
    queryFn: () => getStats(),
  });

  const mutation = useMutation({
    mutationFn: (manual: boolean) => triggerCampaign({ data: { manual } }),
    onSuccess: (data) => {
      toast.success(`Campanha enviada: ${data.sent} sucessos, ${data.failed} falhas.`);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Carregando dados de reativação...</div>;

  return (
    <div className="space-y-6">
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
            <div className="text-xs text-muted-foreground uppercase font-semibold">Total Enviado (Último)</div>
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
        <div className="flex items-center justify-between">
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
            className="gap-2"
          >
            {mutation.isPending ? "Enviando..." : "Enviar Campanha Agora"}
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {stats?.lastSentAt && (
          <div className="bg-muted/50 rounded-lg p-4 border space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <History className="h-4 w-4 text-muted-foreground" />
                Último envio
              </div>
              <Badge variant="outline">
                {format(new Date(stats.lastSentAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <div className="text-xs font-bold text-muted-foreground uppercase">Mensagem enviada:</div>
              <div className="text-sm bg-background p-3 rounded border font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {stats.lastMessage}
              </div>
            </div>
          </div>
        )}

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
