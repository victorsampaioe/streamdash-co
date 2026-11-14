import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe2, RefreshCw, ShieldCheck, Info, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { startGlobalpingWorldDns, getGlobalpingWorldDns } from "@/lib/globalping.functions";

const countries = [
  { code: "BR", name: "Brasil", flag: "🇧🇷" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸" },
  { code: "DE", name: "Alemanha", flag: "🇩🇪" },
  { code: "JP", name: "Japão", flag: "🇯🇵" },
  { code: "AU", name: "Austrália", flag: "🇦🇺" },
];

function regionState(state?: string, waiting?: boolean) {
  if (waiting) return { color: "text-blue-300", text: "Aguardando sondas…" };
  if (state === "resolved") return { color: "text-emerald-400", text: "DNS resolvendo" };
  if (state === "unresolved") return { color: "text-red-400", text: "Falha na resolução" };
  return { color: "text-amber-300", text: "Sem resultado disponível" };
}

export function GlobalpingWorldPanel({ serverId }: { serverId: string }) {
  const runCheck = useServerFn(startGlobalpingWorldDns);
  const getCheck = useServerFn(getGlobalpingWorldDns);
  const client = useQueryClient();
  const queryKey = ["globalping-world-dns", serverId];
  const [actionError, setActionError] = useState<string | null>(null);
  const latest = useQuery({
    queryKey,
    queryFn: async () => await getCheck({ data: { serverId } }),
    staleTime: 5000,
    refetchInterval: q => ["reserved", "starting", "in-progress"].includes(q.state.data?.status ?? "") ? 3500 : false,
    retry: 1,
  });
  const run = useMutation({
    mutationFn: async () => await runCheck({ data: { serverId } }),
    onMutate: () => setActionError(null),
    onSuccess: async result => {
      client.setQueryData(queryKey, result);
      await client.invalidateQueries({ queryKey });
      if (result.status === "finished") toast.info("Exibindo a medição recente (cache de 10 minutos).");
      else toast.success("Verificação mundial iniciada em cinco países.");
    },
    onError: (err: Error) => {
      setActionError(err.message || "Erro ao verificar DNS mundial.");
      toast.error(err.message || "Erro no Globalping.");
    },
  });
  const current = latest.data;
  const isRunning = run.isPending || ["reserved", "starting", "in-progress"].includes(current?.status ?? "");
  const results = current?.results ?? [];
  const successes = results.filter(r => r.state === "resolved").length;
  const failures = results.filter(r => r.state === "unresolved").length;
  const timestamp = current?.createdAt
    ? new Date(current.createdAt).toLocaleString("pt-BR") : null;

  return (
    <Card className="overflow-hidden border-blue-500/30 bg-gradient-to-br from-blue-500/[0.07] via-background to-background p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-blue-400" />
            <h3 className="font-bold text-lg">Radar Mundial de DNS</h3>
            <Badge variant="outline" className="border-blue-500/30 text-blue-300 text-[10px]">Globalping</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Consulte a resolução da DNS em sondas de cinco países reais.
            Cada execução utiliza até cinco testes gratuitos compartilhados.
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            Token protegido no servidor. Não é exibido aos revendedores.
          </p>
        </div>
        <Button
          onClick={() => run.mutate()}
          disabled={isRunning}
          className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
          {isRunning ? "Verificando países…" : "Verificar DNS pelo mundo"}
        </Button>
      </div>
      {actionError && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{actionError}</p>}
      {latest.isError && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
        {latest.error instanceof Error ? latest.error.message : "Não foi possível consultar o Radar Mundial agora."}
      </p>}
      {current && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>DNS: <strong className="font-mono text-foreground">{current.target}</strong></span>
            {timestamp && <span>Última consulta: {timestamp}</span>}
            {current.status === "finished" && (
              <>
                <span className="text-emerald-400">{successes} resolvendo</span>
                {failures > 0 && <span className="text-red-400">{failures} com falhas</span>}
              </>
            )}
            {current.status === "in-progress" && <span className="text-blue-300">Consultando sondas distribuídas…</span>}
          </div>
          {current.status === "failed" && (
            <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
              Não foi possível concluir esta rodada. Você pode tentar novamente mais tarde.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {countries.map(country => {
              const result = results.find(r => r.country === country.code);
              const info = regionState(result?.state, current.status !== "finished" && !result);
              return (
                <div key={country.code} className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className="text-lg">{country.flag}</span>
                    <span className="text-sm font-semibold">{country.name}</span>
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${info.color}`}>{info.text}</p>
                  {result && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {result.city && <p>Sonda: {result.city}</p>}
                      {result.latencyMs != null && <p>Consulta DNS: {Math.round(result.latencyMs)} ms</p>}
                      {result.ipAddresses.length > 0 && <p className="break-all font-mono text-foreground">{result.ipAddresses.join(", ")}</p>}
                      <p>{result.detail}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!current && !latest.isLoading && (
        <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-muted-foreground">
          Clique em “Verificar DNS pelo mundo” para começar a primeira medição.
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-start gap-2 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          A medição consulta DNS, não confirma que o streaming está disponível.
          Resultados são indicativos de sondas específicas. Limites de proteção:
          até 12 rodadas por conta em 24h, reaproveitamento de 10 minutos e limite global compartilhado.
        </p>
        <a
          href="https://globalping.io/"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-400 hover:underline"
        >Tecnologia Globalping <ExternalLink className="h-3 w-3" /></a>
      </div>
    </Card>
  );
}
