import React, { useState, useEffect } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { runDiagnostic } from '@/lib/diagnostics.functions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Loader2, XCircle, AlertCircle, User, Globe, Server, Activity, Clock } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  contentId: string;
  contentTitle: string;
  contentType: 'live' | 'movie' | 'series' | 'episode';
};

const STATUS_MAP = {
  working: { label: 'Funcionando', color: 'text-emerald-500', icon: CheckCircle2, bg: 'bg-emerald-500/10' },
  slow: { label: 'Funcionando com lentidão', color: 'text-yellow-500', icon: Activity, bg: 'bg-yellow-500/10' },
  unstable: { label: 'Instável', color: 'text-orange-500', icon: AlertCircle, bg: 'bg-orange-500/10' },
  unavailable: { label: 'Conteúdo indisponível', color: 'text-red-500', icon: XCircle, bg: 'bg-red-500/10' },
  server_unavailable: { label: 'Servidor indisponível', color: 'text-red-600', icon: Server, bg: 'bg-red-600/10' },
  regional_issue: { label: 'Problema regional/rota', color: 'text-blue-500', icon: Globe, bg: 'bg-blue-500/10' },
  client_issue: { label: 'Provável problema no cliente', color: 'text-purple-500', icon: User, bg: 'bg-purple-500/10' },
};

export function DiagnosticDialog({ isOpen, onClose, serverId, serverName, contentId, contentTitle, contentType }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const runner = useServerFn(runDiagnostic);

  const startTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await runner({ data: { serverId, contentId, contentType } });
      setResult(res);
    } catch (e: any) {
      toast.error(e.message || "Erro ao executar diagnóstico");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) startTest();
  }, [isOpen]);

  const steps = result?.steps || [
    { id: 1, label: "Confirmar servidor ativo", status: 'pending' },
    { id: 2, label: "Validar Player API", status: 'pending' },
    { id: 3, label: "Confirmar existência do conteúdo", status: 'pending' },
    { id: 4, label: "Requisição HTTP ao stream", status: 'pending' },
    { id: 5, label: "Medir tempo de resposta (TTFB)", status: 'pending' },
    { id: 6, label: "Leitura parcial do stream", status: 'pending' },
    { id: 7, label: "Confirmar recebimento de mídia", status: 'pending' },
    { id: 8, label: "Encerrar conexão", status: 'pending' },
    { id: 9, label: "Classificar resultado", status: 'pending' },
  ];

  const statusInfo = result ? STATUS_MAP[result.status as keyof typeof STATUS_MAP] : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Diagnóstico de Conteúdo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/50 border border-border/50">
            <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Alvo</div>
            <div className="font-semibold truncate">{contentTitle}</div>
            <div className="text-xs font-mono text-muted-foreground">Servidor: {serverName}</div>
          </div>

          <div className="space-y-3">
            {steps.map((step: any) => (
              <div key={step.id} className="flex items-center justify-between text-sm group">
                <div className="flex items-center gap-3">
                  {step.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : step.status === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : step.status === 'running' ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted shrink-0" />
                  )}
                  <span className={step.status === 'pending' ? 'text-muted-foreground' : 'font-medium'}>
                    {step.label}
                  </span>
                </div>
                {step.details && (
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 h-5 bg-background">
                    {step.details}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {result && (
            <div className={`mt-4 p-4 rounded-xl border ${statusInfo?.bg} ${statusInfo?.color.replace('text-', 'border-')}`}>
              <div className="flex items-center gap-3 mb-2">
                {statusInfo && <statusInfo.icon className="h-6 w-6" />}
                <div className="font-bold text-lg">{statusInfo?.label}</div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs mt-3 opacity-90">
                <div>
                  <div className="text-muted-foreground mb-0.5">Tempo Total</div>
                  <div className="font-mono font-bold text-sm text-foreground">{result.duration_ms}ms</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Resposta (TTFB)</div>
                  <div className="font-mono font-bold text-sm text-foreground">{result.ttfb_ms || '-'}ms</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Leitura de Mídia</div>
                  <div className="font-mono font-bold text-sm text-foreground">{Math.round((result.bytes_read || 0) / 1024)} KB</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Conexão</div>
                  <div className="font-mono font-bold text-sm text-foreground">{result.connection_ms || '-'}ms</div>
                </div>
              </div>
              {result.error && (
                <div className="mt-3 text-xs p-2 rounded bg-black/20 font-mono break-all border border-white/5">
                  ERRO: {result.error}
                </div>
              )}
            </div>
          )}

          {result?.is_cached && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1 py-0.5 bg-muted/30 rounded w-fit mx-auto mt-2">
              <Clock className="h-3 w-3" />
              Resultado recuperado do cache ({new Date(result.cached_at).toLocaleTimeString()})
            </div>
          )}
        </div>

        <DialogFooter className="flex sm:justify-between items-center gap-2">
          <div className="text-[10px] text-muted-foreground max-w-[200px] leading-tight">
            Este teste faz uma sondagem curta de até 512KB. O stream é encerrado imediatamente após a confirmação.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
            <Button size="sm" onClick={startTest} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
              Re-testar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
