import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ExternalLink, 
  History,
  Info,
  ShieldAlert,
  Zap
} from "lucide-react";
import { getRadarSnapshot } from "@/lib/radar.functions";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import type { ExternalIncident, HistoricalIncident } from "@/lib/radar.server";

export const Route = createFileRoute("/_authenticated/app/radar")({
  component: RadarPage,
});

function RadarPage() {
  const { data: snapshot } = useSuspenseQuery({
    queryKey: ["radar-snapshot"],
    queryFn: () => getRadarSnapshot(),
    refetchInterval: 60000,
  });

  const activeIncidents = snapshot.externalIncidents.filter(i => 
    i.status !== "operational" && i.status !== "unknown"
  );
  const operationalServices = snapshot.externalIncidents.filter(i => 
    i.status === "operational" || i.status === "unknown"
  );

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          Radar Brasil
        </h2>
        <p className="text-muted-foreground">
          Monitoramento profissional de incidentes em infraestrutura externa e serviços críticos.
        </p>
      </div>

      {activeIncidents.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse" />
            <h3 className="text-xl font-semibold text-red-500">🚨 Serviços com Incidentes</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeIncidents.map((inc) => (
              <IncidentCard key={inc.provider} incident={inc} />
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              Status dos Serviços
            </CardTitle>
            <CardDescription>
              Acompanhamento em tempo real de provedores globais.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {snapshot.externalIncidents.map((inc) => (
                <div key={inc.provider} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={inc.status} />
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {inc.provider}
                        <a href={inc.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-400 transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-xs text-muted-foreground">{inc.summary}</div>
                    </div>
                  </div>
                  <StatusBadge status={inc.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-400" />
              📊 Histórico de Incidentes
            </CardTitle>
            <CardDescription>
              Registros recentes de instabilidades detectadas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {snapshot.history.length > 0 ? (
                snapshot.history.map((h) => (
                  <div key={h.id} className="flex flex-col gap-1 p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{h.service_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(h.started_at), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{h.description}</div>
                    <div className="flex items-center justify-between mt-1">
                      <StatusBadge status={h.status as any} />
                      {h.duration_minutes && (
                        <span className="text-[10px] text-muted-foreground">
                          Duração: {h.duration_minutes} min
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum incidente registrado no histórico recente.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-4">
        <Info className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-blue-400">Centro de Inteligência de Incidentes</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Este painel utiliza validação inteligente e APIs oficiais. 🚨 Incidentes são exibidos apenas quando confirmados pela fonte. 
            Erros de monitoramento ou falta de resposta isolada são marcados como "Não verificado" para evitar falsos alertas.
          </p>
        </div>
      </div>
    </div>
  );
}

function IncidentCard({ incident }: { incident: ExternalIncident }) {
  const statusColors = {
    operational: "border-green-500/20 bg-green-500/5",
    degraded: "border-yellow-500/20 bg-yellow-500/5",
    partial_outage: "border-orange-500/20 bg-orange-500/5",
    major_outage: "border-red-500/20 bg-red-500/5",
    maintenance: "border-blue-500/20 bg-blue-500/5",
    unknown: "border-slate-500/20 bg-slate-500/5",
  };

  return (
    <Card className={`border-2 ${statusColors[incident.status]}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{incident.provider}</CardTitle>
          <StatusBadge status={incident.status} />
        </div>
        <CardDescription className="text-red-400 font-medium animate-pulse">
          ⚠️ Possível impacto
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded bg-slate-950/50 border border-slate-800 text-sm">
          <p className="font-medium text-slate-300">{incident.provider} apresenta instabilidade.</p>
          <div className="mt-2 space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Pode afetar:</p>
            <ul className="text-xs list-disc list-inside text-slate-400">
              {incident.impact?.split(",").map(i => (
                <li key={i}>{i.trim()}</li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="text-xs space-y-2">
          <div className="flex justify-between text-muted-foreground">
            <span>Status:</span>
            <span className="text-slate-200">{incident.summary}</span>
          </div>
          {incident.updated_at && (
            <div className="flex justify-between text-muted-foreground">
              <span>Última atualização:</span>
              <span className="text-slate-200">
                {format(new Date(incident.updated_at), "HH:mm", { locale: ptBR })}
              </span>
            </div>
          )}
        </div>

        {incident.recommendation && (
          <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 text-[10px] text-red-400 border border-red-500/20">
            <AlertTriangle className="w-3 h-3" />
            {incident.recommendation}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ExternalIncident["status"] }) {
  const configs = {
    operational: { label: "Operacional", variant: "outline" as const, className: "text-green-500 border-green-500/20 bg-green-500/10" },
    degraded: { label: "Degradado", variant: "outline" as const, className: "text-yellow-500 border-yellow-500/20 bg-yellow-500/10" },
    partial_outage: { label: "Instabilidade", variant: "outline" as const, className: "text-orange-500 border-orange-500/20 bg-orange-500/10" },
    major_outage: { label: "Indisponível", variant: "outline" as const, className: "text-red-500 border-red-500/20 bg-red-500/10" },
    maintenance: { label: "Manutenção", variant: "outline" as const, className: "text-blue-500 border-blue-500/20 bg-blue-500/10" },
    unknown: { label: "Não verificado", variant: "outline" as const, className: "text-slate-400 border-slate-500/20 bg-slate-500/5" },
  };

  const config = configs[status];
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}

function StatusIcon({ status }: { status: ExternalIncident["status"] }) {
  switch (status) {
    case "operational": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "degraded": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "partial_outage": return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    case "major_outage": return <ShieldAlert className="w-4 h-4 text-red-500" />;
    case "maintenance": return <Clock className="w-4 h-4 text-blue-500" />;
    default: return <Zap className="w-4 h-4 text-slate-500" />;
  }
}