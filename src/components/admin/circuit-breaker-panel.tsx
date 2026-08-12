import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getCircuitBreakers } from '@/lib/diagnostics.functions';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, Zap, ZapOff, AlertCircle, Clock } from 'lucide-react';

export function CircuitBreakerPanel() {
  const load = useServerFn(getCircuitBreakers);
  const { data, isLoading } = useQuery({
    queryKey: ['diagnostic-circuit-breakers'],
    queryFn: () => load(),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="text-center p-10 text-muted-foreground">Carregando estados...</div>;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-6">
        <Zap className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-lg">Circuit Breakers de Diagnóstico</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data || []).map((cb: any) => (
          <div
            key={cb.server_id}
            className={`p-4 rounded-lg border ${
              cb.state === 'open' 
                ? 'bg-red-500/5 border-red-500/20' 
                : cb.state === 'half-open'
                ? 'bg-yellow-500/5 border-yellow-500/20'
                : 'bg-emerald-500/5 border-emerald-500/20'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold truncate max-w-[150px]">
                  {cb.servers?.name || 'Servidor'}
                </span>
              </div>
              <Badge
                variant={cb.state === 'open' ? 'destructive' : cb.state === 'half-open' ? 'outline' : 'default'}
                className={cb.state === 'closed' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
              >
                {cb.state === 'closed' ? <Zap className="h-3 w-3 mr-1" /> : <ZapOff className="h-3 w-3 mr-1" />}
                {cb.state.toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Falhas seguidas:</span>
                <span className="font-mono">{cb.failure_count}</span>
              </div>
              {cb.next_test_at && (
                <div className="flex justify-between items-center text-red-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Próximo teste:</span>
                  </div>
                  <span className="font-mono">
                    {new Date(cb.next_test_at).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {cb.last_failure_at && (
                <div className="text-[10px] text-muted-foreground text-right mt-2 italic">
                  Última falha: {new Date(cb.last_failure_at).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        ))}

        {(!data || data.length === 0) && (
          <div className="col-span-full py-10 text-center text-sm text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-20" />
            Nenhum servidor com histórico de falhas de diagnóstico.
          </div>
        )}
      </div>
    </Card>
  );
}
