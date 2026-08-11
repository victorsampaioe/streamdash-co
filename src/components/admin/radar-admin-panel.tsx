import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Server, ShieldCheck, Clock, Film, Trophy, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getIptvRadarStats, prepareRadarBatchSync, runRadarBatchSyncNow } from "@/lib/radar-stats.functions";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function RadarAdminPanel() {
  const qc = useQueryClient();
  const getStats = useServerFn(getIptvRadarStats);
  const prepareSync = useServerFn(prepareRadarBatchSync);
  const runSync = useServerFn(runRadarBatchSyncNow);
  
  const [showConfirm, setShowConfirm] = useState(false);
  const [prepData, setPrepData] = useState<{ servers_found: number; server_ids: string[] } | null>(null);

  const { data: s, isLoading } = useQuery({
    queryKey: ["admin-radar-stats"],
    queryFn: () => getStats(),
  });

  const prepareMutation = useMutation({
    mutationFn: () => prepareSync(),
    onSuccess: (data) => {
      setPrepData(data);
      setShowConfirm(true);
    },
    onError: (e: Error) => {
      console.error("[Radar Admin Log] Erro na preparação:", e);
      toast.error("Erro ao preparar sincronização: " + e.message);
    },

  });

  const syncMutation = useMutation({
    mutationFn: (ids: string[]) => runSync({ data: { serverIds: ids } }),
    onSuccess: (res) => {
      const ok = res.results.filter(r => r.ok).length;
      const fail = res.results.length - ok;
      toast.success(`Sincronização concluída: ${ok} sucesso(s), ${fail} falha(s).`);
      qc.invalidateQueries({ queryKey: ["admin-radar-stats"] });
      setShowConfirm(false);
    },
    onError: (e: Error) => {
      console.error("[Radar Admin Log] Erro na sincronização:", e);
      toast.error("Erro na sincronização: " + e.message);
    },

  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Carregando dados do Radar...</div>;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Gerenciamento do Radar IPTV
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Separamos servidores monitorados daqueles com acesso IPTV configurado para otimizar o Radar.
            </p>
          </div>
          <Button 
            onClick={() => prepareMutation.mutate()}
            disabled={prepareMutation.isPending || syncMutation.isPending}
            className="gap-2"
          >
            {prepareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Sincronizar Conteúdos Agora
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          <StatCard 
            icon={Server} 
            label="✅ Servidores ativos monitorados" 
            value={s?.total_monitored ?? 0} 
            color="text-blue-500"
          />
          <StatCard 
            icon={ShieldCheck} 
            label="🔐 Com acesso IPTV configurado" 
            value={s?.configured_iptv ?? 0} 
            color="text-emerald-500"
          />
          <StatCard 
            icon={Clock} 
            label="⏳ Aguardando credenciais IPTV" 
            value={s?.waiting_credentials ?? 0} 
            color="text-amber-500"
          />
          <StatCard 
            icon={Film} 
            label="🎬 Conteúdos encontrados" 
            value={s?.total_contents ?? 0} 
            color="text-primary"
            sub={s?.total_contents === 0 ? "Sincronização Inicial Pendente" : undefined}
          />
          <StatCard 
            icon={Trophy} 
            label="🏆 Primeiras detecções" 
            value={s?.first_detections ?? 0} 
            color="text-emerald-500"
          />
        </div>

        <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg flex gap-3">
          <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-semibold">Regra de Sincronização:</p>
            <p className="text-muted-foreground">
              A sincronização do Radar considera apenas servidores com **usuário IPTV, senha IPTV, URL Xtream válida e teste de login aprovado**. 
              Servidores sem credenciais configuradas não entram na fila para economizar processamento.
            </p>
          </div>
        </div>
      </Card>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Sincronização em Lote</DialogTitle>
            <DialogDescription>
              Encontramos **{prepData?.servers_found}** servidores preparados para sincronização de conteúdo (com credenciais válidas). 
              Deseja iniciar o processo agora?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>Cancelar</Button>
            <Button 
              onClick={() => prepData && syncMutation.mutate(prepData.server_ids)}
              disabled={syncMutation.isPending}
              className="gap-2"
            >
              {syncMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Iniciar Sincronização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="bg-muted/30 p-4 rounded-lg border flex items-start gap-3">
      <div className={cn("p-2 rounded-md bg-background border", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</div>
        <div className="text-2xl font-bold mt-0.5">{value.toLocaleString("pt-BR")}</div>
        {sub && <div className="text-[10px] text-primary font-medium mt-1">{sub}</div>}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
