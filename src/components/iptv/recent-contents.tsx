import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clock, History, Server, Sparkles } from "lucide-react";

type RecentRow = {
  title_key: string;
  title: string;
  kind: string;
  first_seen_at: string;
  server_count: number;
  first_server: string | null;
  mine_has: boolean;
};

type ServerRow = { server_name: string; seen_at: string; is_mine: boolean };

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: unknown }> }).rpc(fn, args);

const MEDALS = ["🥇", "🥈", "🥉"];
const ICON: Record<string, string> = { vod: "🎬", series: "📺", live: "📡" };
const KIND_LABEL: Record<string, string> = { vod: "Filme", series: "Série", live: "Canal" };

const full = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function human(s: string) {
  const d = new Date(s);
  const now = new Date();
  const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, now)) return `hoje ${hhmm}`;
  const y = new Date(now.getTime() - 864e5);
  if (sameDay(d, y)) return `ontem ${hhmm}`;
  return full(s);
}

const KINDS = [
  { k: "all", l: "Tudo" },
  { k: "vod", l: "Filmes" },
  { k: "series", l: "Séries" },
  { k: "live", l: "Canais" },
] as const;

export function RecentContents() {
  const [kind, setKind] = useState<string>("all");
  const [order, setOrder] = useState<"new" | "old">("new");
  const [limit, setLimit] = useState(40);
  const [open, setOpen] = useState<RecentRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["iptv-recent-titles", kind, order, limit],
    queryFn: async () =>
      ((await rpc("iptv_recent_titles", { _kind: kind, _limit: limit, _offset: 0, _order: order })).data ??
        []) as RecentRow[],
    refetchInterval: 120_000,
  });

  const { data: servers = [], isFetching: loadingServers } = useQuery({
    queryKey: ["iptv-title-servers", open?.title_key],
    enabled: !!open,
    queryFn: async () => ((await rpc("iptv_title_servers", { _title_key: open!.title_key })).data ?? []) as ServerRow[],
  });

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {order === "new" ? <Sparkles className="h-5 w-5 text-primary" /> : <History className="h-5 w-5 text-primary" />}
          <h2 className="font-semibold">
            {order === "new" ? "🆕 Últimos lançamentos encontrados" : "📚 Conteúdos antigos"}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Ordenado pela data de primeira detecção nos servidores monitorados. Clique em um título para ver quais
          servidores possuem o conteúdo e quando cada um adicionou.
        </p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((o) => (
            <Button key={o.k} size="sm" variant={kind === o.k ? "default" : "outline"} onClick={() => setKind(o.k)}>
              {o.l}
            </Button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant={order === "new" ? "default" : "outline"} onClick={() => setOrder("new")}>
              🆕 Mais recentes
            </Button>
            <Button size="sm" variant={order === "old" ? "default" : "outline"} onClick={() => setOrder("old")}>
              📚 Mais antigos
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Carregando catálogo...</Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum conteúdo catalogado ainda. Sincronize um servidor IPTV para começar a registrar as datas de detecção.
        </Card>
      ) : (
        <>
          <Card className="divide-y">
            {rows.map((r) => (
              <button
                key={r.title_key}
                type="button"
                onClick={() => setOpen(r)}
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="text-lg shrink-0">{ICON[r.kind] ?? "🎬"}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Detectado: {human(r.first_seen_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Server className="h-3 w-3" /> Em {r.server_count} servidor{r.server_count > 1 ? "es" : ""}
                    </span>
                  </div>
                </div>
                <Badge variant={r.mine_has ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                  {KIND_LABEL[r.kind] ?? r.kind}
                </Badge>
              </button>
            ))}
          </Card>
          {rows.length >= limit && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 40)}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{ICON[open?.kind ?? "vod"] ?? "🎬"}</span>
              <span className="truncate">{open?.title}</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            🖥️ Servidores que possuem este conteúdo · primeira detecção em {open ? full(open.first_seen_at) : "—"}
          </p>
          <div className="divide-y max-h-[50vh] overflow-y-auto">
            {loadingServers ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Carregando servidores...</p>
            ) : servers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum servidor com este conteúdo.</p>
            ) : (
              servers.map((s, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="truncate text-sm">
                    {MEDALS[i] ?? `#${i + 1}`} {s.server_name}
                    {s.is_mine && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Seu
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                    {i === 0 ? "Primeiro a adicionar: " : "Adicionado: "}
                    {full(s.seen_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
