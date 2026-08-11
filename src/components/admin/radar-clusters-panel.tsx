import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Layers, Boxes, Link2, HardDrive, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getClusterDiagnostics,
  rebuildClusters,
  pruneRedundantMatches,
} from "@/lib/radar-clusters.functions";

export function RadarClustersPanel() {
  const qc = useQueryClient();
  const getDiag = useServerFn(getClusterDiagnostics);
  const rebuild = useServerFn(rebuildClusters);
  const prune = useServerFn(pruneRedundantMatches);

  const { data: d, isLoading } = useQuery({
    queryKey: ["radar-cluster-diagnostics"],
    queryFn: () => getDiag(),
  });

  const rebuildM = useMutation({
    mutationFn: () => rebuild(),
    onSuccess: (r: any) => {
      toast.success(
        `Agrupamento concluído: ${r.clusters} servidores lógicos, ${r.aliases_grouped} aliases agrupados.`,
      );
      qc.invalidateQueries({ queryKey: ["radar-cluster-diagnostics"] });
    },
    onError: (e: Error) => toast.error("Falha no agrupamento: " + e.message),
  });

  const pruneM = useMutation({
    mutationFn: () => prune(),
    onSuccess: (r: any) => {
      toast.success(`${(r.removed ?? 0).toLocaleString("pt-BR")} vínculos redundantes removidos.`);
      qc.invalidateQueries({ queryKey: ["radar-cluster-diagnostics"] });
    },
    onError: (e: Error) => toast.error("Falha na limpeza: " + e.message),
  });

  const clusters = (d?.clusters_detail ?? []) as any[];
  const savedMb = ((d?.estimated_saved_bytes ?? 0) / 1024 / 1024).toFixed(1);

  return (
    <Card className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Deduplicação de servidores (servidores lógicos)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Agrupa DNS diferentes que pertencem à mesma infraestrutura usando sinais técnicos
            (impressão digital do catálogo Xtream, IP resolvido e ASN/provedor). Nenhum servidor é
            excluído — o monitoramento de DNS/HTTP continua individual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => rebuildM.mutate()} disabled={rebuildM.isPending} className="gap-2">
            {rebuildM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalcular servidores lógicos
          </Button>
          <Button
            variant="outline"
            onClick={() => pruneM.mutate()}
            disabled={pruneM.isPending || !d?.matches_redundant}
            className="gap-2"
          >
            {pruneM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Limpar vínculos redundantes
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-center animate-pulse text-sm text-muted-foreground">Carregando diagnóstico...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric icon={Boxes} label="Servidores cadastrados" value={d?.servers_total ?? 0} />
            <Metric icon={Boxes} label="Servidores IPTV" value={d?.servers_iptv ?? 0} />
            <Metric icon={Layers} label="Servidores lógicos" value={d?.logical_servers ?? 0} />
            <Metric icon={Layers} label="Aliases agrupados" value={d?.aliases_grouped ?? 0} />
            <Metric icon={Link2} label="Vínculos (antes)" value={d?.matches_before ?? 0} />
            <Metric icon={Link2} label="Vínculos (depois)" value={d?.matches_after ?? 0} />
            <Metric icon={Link2} label="Vínculos redundantes" value={d?.matches_redundant ?? 0} />
            <Metric icon={HardDrive} label="Economia estimada" value={`${savedMb} MB`} />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Grupos detectados ({clusters.length})</h3>
            {clusters.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum grupo confirmado ainda. Clique em “Recalcular servidores lógicos”.
              </p>
            ) : (
              <div className="space-y-2">
                {clusters.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{c.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.members} DNS agrupados</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(c.aliases ?? []).map((a: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px] py-0">
                          {a.name} · {a.host}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="bg-muted/30 p-3 rounded-lg border">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-xl font-bold mt-1">
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </div>
    </div>
  );
}
