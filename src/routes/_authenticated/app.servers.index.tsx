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
import { Plus, ServerIcon, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/servers/")({
  component: ServersList,
});

function ServersList() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const { data: servers = [] } = useQuery({
    queryKey: ["servers"],
    queryFn: async () => (await supabase.from("servers").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["servers"] }); toast.success("Servidor removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = servers.filter((s) => !q || `${s.name} ${s.host}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Servidores</h1>
          <p className="text-sm text-muted-foreground">Todos os hosts monitorados. Porta fixa 80 / HTTP.</p>
        </div>
        <div className="flex gap-2">
          <SearchInput value={q} onChange={setQ} />
          <Link to="/app/servers/new"><Button><Plus className="h-4 w-4 mr-1" />Novo</Button></Link>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
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
                <td className="p-3"><div className="flex items-center gap-2"><StatusDot status={s.current_status} /><StatusLabel status={s.current_status} /></div></td>
                <td className="p-3 font-mono text-xs">{s.last_latency_ms ?? "—"} ms</td>
                <td className="p-3 font-mono text-xs">{s.ssl_days_remaining != null ? `${s.ssl_days_remaining}d` : "—"}</td>
                <td className="p-3 text-right">
                  {s.is_public && s.public_slug && (
                    <Link to="/status/$slug" params={{ slug: s.public_slug }}>
                      <Button variant="ghost" size="icon" title="Ver página pública"><ExternalLink className="h-4 w-4" /></Button>
                    </Link>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => confirm(`Remover "${s.name}"?`) && del.mutate(s.id)} title="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
