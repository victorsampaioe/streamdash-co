import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Server, ShieldCheck, Clock, Film, Trophy, AlertTriangle, Loader2, Tv, Image, Search, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getIptvRadarStats } from "@/lib/radar-stats.functions";
import { startRadarSyncJob, getRadarJobStatus } from "@/lib/radar-jobs.functions";
import { cn } from "@/lib/utils";
import { searchRadarTitleManual } from "@/lib/radar-admin.functions";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export function RadarAdminPanel() {
  const qc = useQueryClient();
  const getStats = useServerFn(getIptvRadarStats);
  const getJob = useServerFn(getRadarJobStatus);
  const startJob = useServerFn(startRadarSyncJob);
  const searchManual = useServerFn(searchRadarTitleManual);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);

  const { data: s, isLoading } = useQuery({
    queryKey: ["admin-radar-stats"],
    queryFn: () => getStats(),
  });

  const { data: progress } = useQuery({
    queryKey: ["admin-radar-job"],
    queryFn: () => getJob(),
    refetchInterval: 10_000,
  });

  const job = progress?.job as any | null;
  const running = job && (job.status === "queued" || job.status === "running");

  const startMutation = useMutation({
    mutationFn: () => startJob(),
    onSuccess: (data: any) => {
      toast.success(
        `Sincronização enfileirada: ${data.total_servers} servidores. O processamento continua no servidor mesmo se você fechar o navegador.`,
      );
      qc.invalidateQueries({ queryKey: ["admin-radar-job"] });
    },
    onError: (e: Error) => toast.error("Erro ao iniciar sincronização: " + e.message),
  });

  const searchMutation = useMutation({
    mutationFn: (title: string) => searchManual({ data: { title } }),
    onSuccess: (res: any) => {
      setSearchResult(res);
      if (res.found) {
        toast.success(`Título encontrado em ${res.server_count} servidores!`);
      } else {
        toast.error("Título não encontrado nos servidores ativos.");
      }
    },
    onError: (e: Error) => toast.error("Erro na busca: " + e.message),
  });

  if (isLoading) return <div className="p-8 text-center animate-pulse">Carregando dados do Radar...</div>;

  const pct = job?.total_servers ? Math.round(((job.processed ?? 0) / job.total_servers) * 100) : 0;

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
              Coleta apenas Filmes (VOD) e Séries. Canais ao vivo e rádios não entram no Radar.
            </p>
          </div>
          <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending || !!running} className="gap-2">
            {startMutation.isPending || running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {running ? "Sincronização em andamento" : "Sincronizar Conteúdos Agora"}
          </Button>
        </div>

        {job && (
          <div className="mt-6 rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                Radar IPTV — {job.status === "running" ? "Executando" : job.status === "queued" ? "Na fila" : "Concluído"}
                {job.kind === "auto" ? " (automático)" : ""}
              </span>
              <span className="text-muted-foreground">
                Servidores: {job.processed ?? 0}/{job.total_servers ?? 0}
              </span>
            </div>
            <Progress value={pct} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
              <div>🎬 Filmes: <b className="text-foreground">{(job.movies_found ?? 0).toLocaleString("pt-BR")}</b></div>
              <div>📺 Séries: <b className="text-foreground">{(job.series_found ?? 0).toLocaleString("pt-BR")}</b></div>
              <div>✅ Sucesso: <b className="text-foreground">{job.success_count ?? 0}</b></div>
              <div>❌ Falhas: <b className="text-foreground">{job.failed_count ?? 0}</b></div>
            </div>
            {job.last_error && <div className="text-xs text-destructive break-all">Último erro: {job.last_error}</div>}
            <div className="text-[11px] text-muted-foreground">
              Última atualização: {job.updated_at ? new Date(job.updated_at).toLocaleString("pt-BR") : "—"}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          <StatCard icon={Server} label="✅ Servidores ativos monitorados" value={s?.total_monitored ?? 0} color="text-blue-500" />
          <StatCard icon={ShieldCheck} label="🔐 Com acesso IPTV configurado" value={s?.configured_iptv ?? 0} color="text-emerald-500" />
          <StatCard icon={Clock} label="⏳ Aguardando credenciais IPTV" value={s?.waiting_credentials ?? 0} color="text-amber-500" />
          <StatCard icon={Film} label="🎬 Filmes no catálogo" value={progress?.catalog.movies ?? 0} color="text-primary" />
          <StatCard icon={Tv} label="📺 Séries no catálogo" value={progress?.catalog.series ?? 0} color="text-purple-500" />
          <StatCard icon={Image} label="🖼️ TMDB identificados" value={progress?.catalog.tmdb_found ?? 0} color="text-cyan-500"
            sub={`${(progress?.catalog.tmdb_pending ?? 0).toLocaleString("pt-BR")} pendentes de enriquecimento`} />
          <StatCard icon={Trophy} label="🏆 Primeiras detecções" value={s?.first_detections ?? 0} color="text-emerald-500" />
        </div>

        <div className="mt-6 p-4 bg-primary/5 border border-primary/20 rounded-lg flex gap-3">
          <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-semibold">Como funciona:</p>
            <p className="text-muted-foreground">
              A sincronização cria um job processado em segundo plano pelo Core AWS, em lotes de 5 servidores. Falhas
              individuais são registradas sem interromper os demais. O catálogo é incremental (nada é apagado a cada
              execução) e o TMDB é aplicado numa segunda etapa — títulos não identificados ficam salvos como pendentes.
              O Core também executa sincronizações automáticas periódicas.
            </p>
          </div>
        </div>
      </Card>
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
