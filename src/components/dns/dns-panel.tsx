import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, Cloud, ShieldCheck, Globe, Activity, ArrowDown, Check, AlertTriangle, Clock,
} from "lucide-react";
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area,
} from "recharts";
import { runDnsCheckNow, acknowledgeDnsAlert } from "@/lib/dns.functions";

type ResolverResult = {
  code: string; name: string; country: string; ok: boolean;
  ips: string[]; response_ms: number | null; ttl: number | null; error: string | null;
};
type PropagationRegion = { code: string; name: string; flag: string; ok: boolean; matches: boolean; ips: string[] };

function scoreTone(score: number) {
  if (score >= 90) return { label: "Excelente", cls: "text-success", bar: "bg-success" };
  if (score >= 70) return { label: "Bom", cls: "text-primary", bar: "bg-primary" };
  if (score >= 50) return { label: "Atenção", cls: "text-warning", bar: "bg-warning" };
  return { label: "Crítico", cls: "text-destructive", bar: "bg-destructive" };
}

function fmtGap(seconds: number | null) {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DnsPanel({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const runNow = useServerFn(runDnsCheckNow);
  const ackAlert = useServerFn(acknowledgeDnsAlert);

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ["dns-snapshots", serverId],
    queryFn: async () =>
      (await supabase.from("dns_snapshots").select("*").eq("server_id", serverId)
        .order("checked_at", { ascending: false }).limit(200)).data ?? [],
    refetchInterval: 60_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["dns-ip-history", serverId],
    queryFn: async () =>
      (await supabase.from("dns_ip_history").select("*").eq("server_id", serverId)
        .order("changed_at", { ascending: false }).limit(30)).data ?? [],
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["dns-alerts", serverId],
    queryFn: async () =>
      (await supabase.from("dns_alerts").select("*").eq("server_id", serverId)
        .is("acknowledged_at", null).order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const latest = snapshots[0];
  const series = useMemo(
    () =>
      [...snapshots].reverse().map((s) => ({
        t: new Date(s.checked_at).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        ms: s.avg_response_ms ?? 0,
        score: s.health_score ?? 0,
        prop: s.propagation_pct ?? 0,
        up: s.status === "down" ? 0 : 100,
      })),
    [snapshots],
  );

  async function handleRun() {
    try {
      const r = await runNow({ data: { serverId } });
      toast.success(`Análise concluída — Health Score ${r.score}%`);
      qc.invalidateQueries({ queryKey: ["dns-snapshots", serverId] });
      qc.invalidateQueries({ queryKey: ["dns-ip-history", serverId] });
      qc.invalidateQueries({ queryKey: ["dns-alerts", serverId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise");
    }
  }

  async function ack(id: string) {
    await ackAlert({ data: { alertId: id } });
    qc.invalidateQueries({ queryKey: ["dns-alerts", serverId] });
  }

  const resolvers = (latest?.resolvers ?? []) as unknown as ResolverResult[];
  const propagation = (latest?.propagation ?? []) as unknown as PropagationRegion[];
  const records = (latest?.records ?? {}) as Record<string, string[]>;
  const tone = scoreTone(latest?.health_score ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-medium">Inteligência de DNS</h3>
          <p className="text-xs text-muted-foreground">
            {latest ? `Última análise: ${new Date(latest.checked_at).toLocaleString()}` : "Ainda não analisado"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRun}>
          <RefreshCw className="h-4 w-4 mr-1" /> Analisar agora
        </Button>
      </div>

      {!latest && !isLoading && (
        <Card className="p-8 text-center text-sm text-muted-foreground border-dashed">
          Clique em <strong>Analisar agora</strong> para checar resolvedores, propagação, proxy Cloudflare, DNSSEC e WHOIS.
        </Card>
      )}

      {latest && (
        <>
          {alerts.length > 0 && (
            <Card className="p-4 space-y-2 border-warning/40">
              <h4 className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Alertas inteligentes</h4>
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium break-words">{a.title}</div>
                      {a.detail && <div className="text-xs text-muted-foreground font-mono break-all">{a.detail}</div>}
                      <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => ack(a.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5 md:col-span-1">
              <div className="text-xs text-muted-foreground mb-1">DNS Health Score</div>
              <div className={`text-4xl font-semibold ${tone.cls}`}>{latest.health_score ?? 0}%</div>
              <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden">
                <div className={`h-full ${tone.bar}`} style={{ width: `${latest.health_score ?? 0}%` }} />
              </div>
              <div className={`text-sm mt-2 ${tone.cls}`}>{tone.label}</div>
            </Card>

            <Card className="p-5 md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat icon={<Cloud className="h-4 w-4" />} label="Proxy Cloudflare" value={latest.cloudflare_proxy ? "Ativo" : "DNS Only"} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Resposta média" value={latest.avg_response_ms != null ? `${latest.avg_response_ms}ms` : "—"} />
              <Stat icon={<Clock className="h-4 w-4" />} label="TTL" value={latest.ttl_seconds != null ? `${latest.ttl_seconds}s` : "—"} />
              <Stat icon={<ShieldCheck className="h-4 w-4" />} label="DNSSEC" value={latest.dnssec == null ? "—" : latest.dnssec ? "Válido" : "Inativo"} />
            </Card>
          </div>

          {/* Comparação de resolvedores */}
          <Card className="p-5">
            <h4 className="text-sm font-medium mb-3">Comparação entre resolvedores</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-4 font-medium">Resolver</th>
                    <th className="py-2 pr-4 font-medium">IP</th>
                    <th className="py-2 pr-4 font-medium">Tempo</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvers.map((r) => {
                    const divergent = r.ok && latest.primary_ip != null && !r.ips.includes(latest.primary_ip);
                    return (
                      <tr key={r.code} className="border-t border-border/40">
                        <td className="py-2 pr-4">{r.name}<div className="text-[11px] text-muted-foreground">{r.country}</div></td>
                        <td className="py-2 pr-4 font-mono break-all">{r.ips.join(", ") || "—"}</td>
                        <td className="py-2 pr-4 font-mono">{r.response_ms != null ? `${r.response_ms} ms` : "—"}</td>
                        <td className="py-2">
                          {!r.ok ? <Badge variant="destructive">{r.error ?? "falha"}</Badge>
                            : divergent ? <Badge variant="outline" className="text-warning">⚠ divergente</Badge>
                            : <Badge variant="outline" className="text-success">✅ ok</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Propagação */}
            <Card className="p-5">
              <h4 className="text-sm font-medium mb-1">Propagação</h4>
              <div className="text-3xl font-semibold mb-3">{latest.propagation_pct ?? 0}%</div>
              <div className="h-2 rounded-full bg-muted mb-4 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${latest.propagation_pct ?? 0}%` }} />
              </div>
              <ul className="space-y-1.5 text-sm">
                {propagation.map((p) => (
                  <li key={p.code} className="flex items-center justify-between">
                    <span>{p.flag} {p.name}</span>
                    <span className="font-mono text-xs">
                      {p.matches ? "✅" : p.ok ? "⏳" : "⚠"} {p.ips[0] ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Informações avançadas */}
            <Card className="p-5 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2 mb-2"><Globe className="h-4 w-4" /> Informações avançadas</h4>
              <Row label="ASN" value={latest.asn ?? "—"} />
              <Row label="Datacenter / Org" value={latest.datacenter ?? "—"} />
              <Row label="País / Cidade" value={[latest.city, latest.country].filter(Boolean).join(", ") || "—"} />
              <Row label="IPv4" value={latest.ipv4?.join(", ") || "—"} mono />
              <Row label="IPv6" value={latest.ipv6?.join(", ") || "—"} mono />
              <Row label="Nameservers" value={latest.nameservers?.join(", ") || "—"} mono />
              <Row label="Registrar" value={latest.registrar ?? "—"} />
              <Row
                label="Expiração do domínio"
                value={latest.domain_expires_at ? new Date(latest.domain_expires_at).toLocaleDateString() : "—"}
              />
            </Card>
          </div>

          {/* Registros */}
          <Card className="p-5">
            <h4 className="text-sm font-medium mb-3">Registros encontrados</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"].map((t) => (
                <div key={t} className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">{t}</span>
                    <Badge variant="outline" className="text-[10px]">{records[t]?.length ?? 0}</Badge>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground break-all line-clamp-4">
                    {records[t]?.length ? records[t].join("\n") : "—"}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Diagnóstico */}
          <Card className="p-5">
            <h4 className="text-sm font-medium mb-3">Diagnóstico automático</h4>
            <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
              {(latest.diagnosis ?? []).map((d: string, i: number) => <li key={i}>{d}</li>)}
            </ul>
          </Card>

          {/* Gráficos */}
          <div className="grid gap-4 md:grid-cols-2">
            <Chart title="Tempo de resposta DNS" data={series} dataKey="ms" unit="ms" color="var(--color-primary)" />
            <Chart title="Health Score ao longo do tempo" data={series} dataKey="score" unit="%" color="var(--color-success)" />
            <Chart title="Histórico de propagação" data={series} dataKey="prop" unit="%" color="var(--color-warning)" area />
            <Chart title="Disponibilidade do DNS" data={series} dataKey="up" unit="%" color="var(--color-primary)" area />
          </div>

          {/* Histórico de mudanças */}
          <Card className="p-5">
            <h4 className="text-sm font-medium mb-3">Histórico de mudanças de IP</h4>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma mudança registrada.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <div className="text-xs text-muted-foreground">
                      {new Date(h.changed_at).toLocaleDateString()} · {new Date(h.changed_at).toLocaleTimeString()}
                      {h.seconds_since_previous != null && ` · ${fmtGap(h.seconds_since_previous)} desde a anterior`}
                    </div>
                    <div className="font-mono text-xs mt-1">{h.old_ip ?? "—"}</div>
                    <ArrowDown className="h-3 w-3 text-muted-foreground my-0.5" />
                    <div className="font-mono text-xs font-medium">{h.new_ip ?? "—"}</div>
                    {h.old_asn !== h.new_asn && (
                      <div className="text-[11px] text-warning mt-0.5">ASN: {h.old_asn ?? "—"} → {h.new_asn ?? "—"}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">{icon}{label}</div>
      <div className="text-sm font-medium break-words">{value}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Chart({
  title, data, dataKey, unit, color, area,
}: {
  title: string;
  data: Array<Record<string, string | number>>;
  dataKey: string;
  unit: string;
  color: string;
  area?: boolean;
}) {
  return (
    <Card className="p-5">
      <h4 className="text-sm font-medium mb-3">{title}</h4>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          {area ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" unit={unit} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" unit={unit} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
