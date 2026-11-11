import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/admin/telegram-guard")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Telegram Delivery Guard | Stream Monitor" },
      { name: "description", content: "Fila durável de reenvio de alertas Telegram com retry e dead letter." },
      { property: "og:title", content: "Telegram Delivery Guard | Stream Monitor" },
      { property: "og:description", content: "Status das entregas Telegram pendentes, enviadas e falhas definitivas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const LABEL: Record<string, string> = { pending: "Aguardando reenvio", sending: "Enviando", sent: "Entregue", dead: "Falha definitiva" };

function Page() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["telegram-outbox"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("telegram_outbox")
        .select("id, source, status, attempts, max_attempts, last_error, next_attempt_at, delivered_at, created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const counts = (data ?? []).reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Telegram Delivery Guard</h1>
        <p className="text-sm text-muted-foreground">Alertas que falharam no primeiro envio entram nesta fila e são reenviados com espera crescente (30s até 1h, até 6 tentativas). Processada a cada ciclo de monitoramento. Cloudflare Queues: não provisionado.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.keys(LABEL).map((k) => (
          <Card key={k} className="p-4"><div className="text-xs text-muted-foreground">{LABEL[k]}</div><div className="text-2xl font-bold">{counts[k] ?? 0}</div></Card>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Sem acesso: apenas administradores.</p>}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma falha de entrega registrada. Todos os alertas saíram no primeiro envio.</p>}
      <div className="space-y-2">
        {data?.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <Badge variant={r.status === "dead" ? "destructive" : "secondary"}>{LABEL[r.status] ?? r.status}</Badge>
            <span>{r.source}</span>
            <span className="text-muted-foreground">tentativas {r.attempts}/{r.max_attempts}</span>
            <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
            {r.last_error && <span className="w-full truncate text-xs text-muted-foreground">{r.last_error}</span>}
          </Card>
        ))}
      </div>
    </div>
  );
}
