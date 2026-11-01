
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { reconcileAllPayments } from "@/lib/payments.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";

export function SyncPaymentsCard() {
  const [loading, setLoading] = useState(false);
  const reconcile = useServerFn(reconcileAllPayments);
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setLastResult(null);
    const toastId = toast.loading("Sincronizando pagamentos com Mercado Pago...");
    try {
      const res = await reconcile();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["subscription"] }),
      ]);
      const summary = `Mercado Pago: ${res.mp_checked} consultados, ${res.mp_approved} pagos recuperados. Assinaturas corrigidas: ${res.db_fixed}. ${res.db_failed} falhas; ${res.needs_review} para revisão.`;
      setLastResult(summary);
      toast.success(summary, { id: toastId, duration: 7000 });
    } catch (e: any) {
      toast.error("Erro na sincronização: " + (e.message || "Erro desconhecido"), { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 border-primary/20 bg-primary/5 overflow-hidden relative">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-lg">Sincronização Financeira</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Corrija falhas no recebimento de webhooks do Mercado Pago. Esta rotina busca pagamentos aprovados no provedor e garante que as assinaturas e créditos dos usuários estejam ativos.
          </p>
        </div>
        <Button 
          onClick={handleSync} 
          disabled={loading}
          className="shrink-0 gap-2 shadow-lg shadow-primary/20"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sincronizar pagamentos aprovados
        </Button>
      </div>
      
      {lastResult && <p role="status" className="mt-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm font-medium">{lastResult}</p>}
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-success" />
          <span>Verifica approved/paid</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-success" />
          <span>Ativa assinaturas pendentes</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span>Confira qualquer pendência no Mercado Pago</span>
        </div>
      </div>
    </Card>
  );
}
