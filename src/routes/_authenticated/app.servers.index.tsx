import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { SearchInput } from "@/components/app-shell";
import { useSubscription } from "@/hooks/use-subscription";
import { Plus, ServerIcon, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/servers/")({
  component: ServersList,
});

type StatusFilter = "all" | "active" | "up" | "warning" | "down" | "paused";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Ativos" },
  { key: "up", label: "🟢 Online" },
  { key: "warning", label: "🟡 Atenção" },
  { key: "down", label: "🔴 Offline" },
  { key: "paused", label: "⚪ Pausados" },
];

function ServersList() {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { data: sub } = useSubscription();
  const paused = sub ? !sub.isActive : false;
  const qc = useQueryClient();
  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: async () =>
      (
        await supabase
          .from("servers")
          .select(
            "id, name, description, category, current_status, last_latency_ms, last_checked_at, ssl_days_remaining, health_score, dns_health_score, is_public, public_slug, created_at, monitoring_paused, paused_reason",
          )
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("delete_server", { _id: id });
      if (error) throw error;
      if (data === false) throw new Error("Servidor não encontrado ou já removido");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servers"] }); toast.success("Servidor removido"); setTarget(null); },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao remover"),
  });

  const isPaused = (s: any) => paused || s.monitoring_paused === true;
  const matchFilter = (s: any) => {
    switch (statusFilter) {
      case "paused": return isPaused(s);
      case "active": return !isPaused(s);
      case "up": return !isPaused(s) && s.current_status === "up";
      case "warning": return !isPaused(s) && (s.current_status === "degraded" || s.current_status === "unknown");
      case "down": return !isPaused(s) && s.current_status === "down";
      default: return true;
    }
  };
  const searched = servers.filter((s) => !q || `${s.name} ${s.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  // Filtro padrão: Apenas Ativos (active)
  const filtered = searched.filter(matchFilter).filter(s => statusFilter !== "all" || !isPaused(s));
  const counts = {
    all: searched.length,
    active: searched.filter((s: any) => !isPaused(s)).length,
    up: searched.filter((s: any) => !isPaused(s) && s.current_status === "up").length,
    warning: searched.filter((s: any) => !isPaused(s) && (s.current_status === "degraded" || s.current_status === "unknown")).length,
    down: searched.filter((s: any) => !isPaused(s) && s.current_status === "down").length,
    paused: searched.filter((s: any) => isPaused(s)).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Servidores</h1>
          <p className="text-sm text-muted-foreground">Todos os hosts monitorados. Porta fixa 80 / HTTP.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial"><SearchInput value={q} onChange={setQ} /></div>
          <Link to="/app/servers/new"><Button className="shrink-0"><Plus className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Novo</span></Button></Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={statusFilter === f.key ? "default" : "outline"}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-70">{counts[f.key]}</span>
          </Button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Nome</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Latência</th>
              <th className="text-left p-3 font-medium">SSL</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                <ServerIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />
                Nenhum servidor.
              </td></tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="p-3 font-medium">
                  <Link to="/app/servers/$id" params={{ id: s.id }} className="hover:text-primary">{s.name}</Link>
                </td>
                <td className="p-3">
                  {isPaused(s) ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50 inline-block shrink-0" />
                      <div className="leading-tight">
                        <span className="text-xs font-medium">⚪ Pausado</span>
                        <p className="text-[11px] text-muted-foreground">
                          Motivo: {(s as any).paused_reason === "no_credits" ? "Revendedor sem créditos" : "Assinatura expirada"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2"><StatusDot status={s.current_status} /><StatusLabel status={s.current_status} /></div>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">{s.last_latency_ms ?? "—"} ms</td>
                <td className="p-3 font-mono text-xs">{s.ssl_days_remaining != null ? `${s.ssl_days_remaining}d` : "—"}</td>
                <td className="p-3 text-right">
                  {s.is_public && s.public_slug && (
                    <Link to="/status/$slug" params={{ slug: s.public_slug }}>
                      <Button variant="ghost" size="icon" title="Ver página pública"><ExternalLink className="h-4 w-4" /></Button>
                    </Link>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setTarget({ id: s.id, name: s.name })} title="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      <AlertDialog open={!!target} onOpenChange={(o) => { if (!o && !del.isPending) setTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover servidor</AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga permanentemente "{target?.name}" e todo o histórico de monitoramento. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => { e.preventDefault(); if (target) del.mutate(target.id); }}
            >
              {del.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {del.isPending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
