import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { AlertTriangle, BellRing, CheckCircle2 } from "lucide-react";

type AlertHealth = {
  observed_since: string; sent: number; failed: number; customer_sent: number;
  admin_sent: number; offline_sent: number; recovery_sent: number;
  last_success: string | null;
  failed_by_type: {event: string; failed: number}[];
};

export function AlertDeliveryHealthPanel() {
  const query = useQuery<AlertHealth>({
    queryKey: ["admin-telegram-delivery-health"],
    queryFn: async () => {
      const {data,error}=await (supabase as any).rpc("get_admin_telegram_delivery_health");
      if(error) throw error;
      return data as AlertHealth;
    },
    refetchInterval: 60_000,
  });
  if(query.isLoading) return <Card className="p-4">Conferindo entregas do Telegram...</Card>;
  if(query.isError || !query.data) return (
    <Card role="alert" className="p-4 border-destructive/30">
      O histórico de entregas está indisponível. Não é possível confirmar notificações agora.
    </Card>
  );
  const a=query.data;
  return <Card className="p-5 space-y-3">
    <h3 className="flex items-center gap-2 font-semibold"><BellRing className="w-4 h-4 text-blue-400"/> Entregas Telegram — últimas 24 horas</h3>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Envios aceitos</div><strong className="text-xl">{a.sent}</strong></div>
      <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Falhas registradas</div><strong className="text-xl">{a.failed}</strong></div>
      <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Avisos de queda</div><strong className="text-xl">{a.offline_sent}</strong></div>
      <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Recuperações</div><strong className="text-xl">{a.recovery_sent}</strong></div>
    </div>
    <div className="text-xs text-muted-foreground">Clientes: {a.customer_sent} · Admin: {a.admin_sent} · Último aceite: {a.last_success?new Date(a.last_success).toLocaleString("pt-BR"):"nenhum"}</div>
    {a.failed>0 && <div className="rounded-lg border border-amber-400/25 p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500"/> Falhas que exigem conferência</p>
      {a.failed_by_type.map(row=><div key={row.event} className="text-xs flex justify-between"><span>{row.event}</span><strong>{row.failed}</strong></div>)}
    </div>}
    {a.failed===0 && <p className="text-xs text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500"/> Nenhuma falha registrada nesta janela.</p>}
    <p className="text-xs text-muted-foreground">Aceite da API não garante leitura pelo destinatário. A métrica cobre somente envios com registro no banco.</p>
  </Card>;
}
