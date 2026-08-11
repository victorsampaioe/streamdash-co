
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { reconcileAllPayments } from "@/lib/payments.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, AlertTriangle, Loader2, DollarSign } from "lucide-react";
import { toast } from "sonner";

export function SyncPaymentsCard() {
  const [loading, setLoading] = useState(false);
  const reconcile = useServerFn(reconcileAllPayments);

  const handleSync = async () => {
    setLoading(true);
    const toastId = toast.loading("Sincronizando pagamentos com Mercado Pago...");
    try {
      const res = await reconcile();
      toast.success(
        `Sincronização concluída! \nMP: ${res.mp_checked} verificados, ${res.mp_approved} aprovados. \nBD: ${res.db_fixed} assinaturas ativadas.`,
        { id: toastId, duration: 5000 }
      );
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
      
      <div className="mt-4 flex gap-4 text-xs">
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
          <span>Use apenas se houver atraso na ativação</span>
        </div>
      </div>
    </Card>
  );
}
