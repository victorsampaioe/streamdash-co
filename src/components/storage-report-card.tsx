import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";

type Row = {
  table_name: string;
  rows: number;
  total_bytes: number;
  total_pretty: string;
  index_pretty: string;
  inserts: number;
  updates: number;
  deletes: number;
};

export function StorageReportCard() {
  const q = useQuery({
    queryKey: ["storage-report"],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_storage_report");
      if (error) {
        console.error("Storage report error:", error);
        throw error;
      }
      return (data ?? []) as Row[];
    },
  });

  const rows = (q.data ?? []).slice(0, 12);
  const totalBytes = (q.data ?? []).reduce((s, r) => s + Number(r.total_bytes ?? 0), 0);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Consumo do banco de dados</h2>
        {totalBytes > 0 && (
          <Badge variant="outline">{(totalBytes / 1024 / 1024).toFixed(0)} MB no total</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Maiores tabelas por espaço ocupado. Dados detalhados são resumidos por hora/dia e limpos automaticamente conforme a retenção configurada.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-1.5 pr-3">Tabela</th>
              <th className="py-1.5 pr-3">Linhas</th>
              <th className="py-1.5 pr-3">Total</th>
              <th className="py-1.5 pr-3 hidden sm:table-cell">Índices</th>
              <th className="py-1.5 pr-3 hidden md:table-cell">Gravações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={5} className="py-3 text-muted-foreground">Carregando…</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.table_name} className="border-t border-border/60">
                <td className="py-1.5 pr-3 font-medium truncate max-w-[180px]">{r.table_name}</td>
                <td className="py-1.5 pr-3 tabular-nums">{Number(r.rows).toLocaleString("pt-BR")}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.total_pretty}</td>
                <td className="py-1.5 pr-3 tabular-nums hidden sm:table-cell">{r.index_pretty}</td>
                <td className="py-1.5 pr-3 tabular-nums hidden md:table-cell text-muted-foreground">
                  {Number(r.inserts).toLocaleString("pt-BR")} ins · {Number(r.updates).toLocaleString("pt-BR")} upd
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
