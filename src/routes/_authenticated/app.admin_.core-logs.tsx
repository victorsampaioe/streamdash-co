import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Zap, 
  ShieldCheck,
  Search,
  ChevronRight,
  Filter,
  RefreshCcw,
  BarChart3
} from "lucide-react";
import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/admin_/core-logs")({
  beforeLoad: async ({ context }) => {
    // Apenas admin tem acesso
    const userId = (context as any)?.user?.id;
    if (!userId) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      throw redirect({ to: "/app" });
    }
  },
  component: CoreLogsPage,
});

function CoreLogsPage() {
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ["core-execution-logs", taskFilter, statusFilter],
    queryFn: async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from("core_execution_logs")
        .select("*")
        .gte("created_at", threeHoursAgo)
        .order("created_at", { ascending: false })
        .limit(100);

      if (taskFilter !== "all") query = query.eq("task_type", taskFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000, // Atualiza a cada 10s
  });

  const stats = {
    today: logs?.length || 0,
    successRate: logs?.length 
      ? Math.round((logs.filter(l => l.status === "success").length / logs.length) * 100) 
      : 100,
    avgTime: logs?.length
      ? Math.round(logs.reduce((acc, l) => acc + (l.execution_time_ms || 0), 0) / logs.length)
      : 0,
    failures: logs?.filter(l => l.status === "failed" || l.status === "timeout").length || 0
  };

  const filteredLogs = logs?.filter(l =>
    (l.task_type ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (l.error_message ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Auditoria Core AWS
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento em tempo real da delegação de tarefas para a infraestrutura AWS.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCcw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Execuções (Últimas 100)" 
          value={stats.today} 
          icon={Activity} 
          color="text-blue-500" 
        />
        <StatCard 
          title="Taxa de Sucesso" 
          value={`${stats.successRate}%`} 
          icon={CheckCircle2} 
          color="text-green-500" 
        />
        <StatCard 
          title="Tempo Médio" 
          value={`${(stats.avgTime / 1000).toFixed(1)}s`} 
          icon={Clock} 
          color="text-orange-500" 
        />
        <StatCard 
          title="Falhas/Timeouts" 
          value={stats.failures} 
          icon={AlertCircle} 
          color="text-red-500" 
        />
      </div>

      <Card className="bg-neutral-900/50 border-white/5">
        <CardHeader className="pb-3 border-b border-white/5">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar tarefa ou erro..." 
                  className="pl-9 bg-black/20 border-white/10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Select value={taskFilter} onValueChange={setTaskFilter}>
                <SelectTrigger className="w-full md:w-40 bg-black/20 border-white/10">
                  <SelectValue placeholder="Tarefa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Tarefas</SelectItem>
                  <SelectItem value="check">Check HTTP</SelectItem>
                  <SelectItem value="dns">Check DNS</SelectItem>
                  <SelectItem value="iptv-sync">IPTV Sync</SelectItem>
                  <SelectItem value="content-diagnostic">Diagnóstico</SelectItem>
                  <SelectItem value="radar-job-step">Radar Job</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-40 bg-black/20 border-white/10">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Status</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="failed">Falha</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                  <SelectItem value="running">Rodando</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-white/5">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-[180px]">Data/Hora</TableHead>
                  <TableHead>Tarefa</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-white/5 animate-pulse">
                      <TableCell colSpan={6} className="h-12 bg-white/5" />
                    </TableRow>
                  ))
                ) : filteredLogs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Nenhum log encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs?.map((log) => (
                    <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.created_at ? format(new Date(log.created_at as string), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono bg-blue-500/10 text-blue-400 border-blue-500/20">
                          {log.task_type ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate text-muted-foreground">
                        {(log.endpoint ?? "-").replace("https://", "")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={log.status} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.execution_time_ms ? `${(log.execution_time_ms / 1000).toFixed(2)}s` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight className="h-4 w-4" /> Detalhes
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl bg-neutral-950 border-white/10 max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <Zap className="h-5 w-5 text-primary" />
                                Detalhes da Execução: {log.task_type}
                              </DialogTitle>
                              <DialogDescription>
                                Informações técnicas da chamada realizada ao Core AWS.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground uppercase">ID do Log</span>
                                  <p className="font-mono text-sm break-all">{log.id}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-xs text-muted-foreground uppercase">Horário</span>
                                  <p className="text-sm">{log.created_at ? format(new Date(log.created_at), "PPPP 'às' HH:mm:ss", { locale: ptBR }) : "-"}</p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                                  <RefreshCcw className="h-3 w-3" /> Payload de Entrada
                                </span>
                                <pre className="bg-black/50 p-4 rounded-lg border border-white/5 text-xs overflow-x-auto text-blue-300 whitespace-pre-wrap break-all">
                                  {safeJson(log.request_payload, "Sem payload registrado")}
                                </pre>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground uppercase font-bold flex items-center gap-2">
                                    <BarChart3 className="h-3 w-3" /> Resposta do Core
                                  </span>
                                  <div className="flex gap-2">
                                    <Badge variant="outline">{log.response_status || "???"} HTTP</Badge>
                                    <Badge variant="outline">{(log.execution_time_ms || 0).toLocaleString()}ms</Badge>
                                  </div>
                                </div>
                                <pre className={cn(
                                  "bg-black/50 p-4 rounded-lg border border-white/5 text-xs overflow-x-auto whitespace-pre-wrap break-all",
                                  log.status === "success" ? "text-green-300" : "text-red-300"
                                )}>
                                  {safeJson(log.response_data, "Sem resposta registrada")}
                                </pre>
                              </div>

                              {log.error_message && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                                  <span className="text-xs text-red-400 uppercase font-bold block mb-1">Erro Detectado</span>
                                  <p className="text-sm text-red-200">{log.error_message}</p>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <Card className="bg-neutral-900/50 border-white/5 hover:border-white/10 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", color)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">✅ Sucesso</Badge>;
    case "failed":
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">❌ Falha</Badge>;
    case "timeout":
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">⏳ Timeout</Badge>;
    case "running":
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse">⚙️ Rodando</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}

function safeJson(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  try {
    const out = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return out && out !== "{}" && out !== "[]" ? out : fallback;
  } catch {
    return fallback;
  }
}
