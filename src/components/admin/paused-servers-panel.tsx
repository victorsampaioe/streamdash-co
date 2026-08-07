import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PauseCircle, Search } from "lucide-react";

export type PausedOwner = {
  owner_id: string;
  full_name: string | null;
  email: string | null;
  account_type: "admin" | "reseller" | "sub_reseller" | "client" | string;
  credits: number | null;
  subscription_status: string | null;
  expires_at: string | null;
  paused_reason: string | null;
  paused_servers: number;
  total_servers: number;
  last_paused_at: string | null;
};

export function pauseReasonLabel(row: Pick<PausedOwner, "account_type" | "paused_reason" | "subscription_status">) {
  if (row.account_type === "reseller" || row.account_type === "sub_reseller") return "Revendedor sem créditos";
  if (row.subscription_status === "trial") return "Teste expirado";
  return "Assinatura expirada";
}

const typeLabel: Record<string, string> = {
  admin: "Admin",
  reseller: "Revendedor",
  sub_reseller: "Sub-revendedor",
  client: "Cliente",
};

export function PausedServersPanel() {
  const [q, setQ] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-paused-owners"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_paused_owners");
      if (error) throw error;
      return (data ?? []) as unknown as PausedOwner[];
    },
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter(
      (r) => !term || `${r.full_name ?? ""} ${r.email ?? ""}`.toLowerCase().includes(term),
    );
  }, [data, q]);

  const totalPaused = data.reduce((acc, r) => acc + (r.paused_servers ?? 0), 0);
  const resellers = data.filter((r) => r.account_type === "reseller" || r.account_type === "sub_reseller");
  const clients = data.filter((r) => r.account_type === "client");

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <PauseCircle className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="font-semibold truncate">DNS pausados por expiração</h2>
          <Badge variant="outline" className="shrink-0">{totalPaused}</Badge>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar dono por nome ou e-mail..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">Monitoramentos pausados</p>
          <p className="text-xl font-semibold">{totalPaused}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">Revendedores afetados</p>
          <p className="text-xl font-semibold">{resellers.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs text-muted-foreground">Clientes expirados</p>
          <p className="text-xl font-semibold">{clients.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Dono</th>
              <th className="text-left p-3 font-medium">Tipo</th>
              <th className="text-left p-3 font-medium">Motivo</th>
              <th className="text-left p-3 font-medium">Pausados</th>
              <th className="text-left p-3 font-medium">Créditos</th>
              <th className="text-left p-3 font-medium">Venceu em</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum DNS pausado.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.owner_id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="p-3">
                  <p className="font-medium truncate max-w-[220px]">{r.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-[220px]">{r.email || "—"}</p>
                </td>
                <td className="p-3">
                  <Badge variant={r.account_type === "client" ? "secondary" : "outline"}>
                    {typeLabel[r.account_type] ?? r.account_type}
                  </Badge>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50 inline-block" />
                    {pauseReasonLabel(r)}
                  </span>
                </td>
                <td className="p-3 font-mono text-xs">{r.paused_servers} / {r.total_servers}</td>
                <td className="p-3 font-mono text-xs">{r.credits ?? 0}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
