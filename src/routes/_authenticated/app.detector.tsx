import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Globe, Loader2, Search, ShieldAlert, ShieldOff, Wifi } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { runBlockDetector } from "@/lib/detector.functions";
import type { DetectorReport, Verdict } from "@/lib/detector.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/detector")({
  head: () => ({
    meta: [
      { title: "Detector de Bloqueios — DNS, firewall e geo | StreamMonitor" },
      { name: "description", content: "Descubra se um domínio está bloqueado por DNS, firewall ou geolocalização. Testa 4 resolvers públicos (Cloudflare, Google, Quad9, OpenDNS) e o acesso HTTPS." },
      { property: "og:title", content: "Detector de Bloqueios de Domínio" },
      { property: "og:description", content: "Teste em segundos se um site está bloqueado por DNS, firewall ou geo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: ({ error }) => (
    <Shell><Card className="p-6 text-center text-sm text-muted-foreground">{error.message}</Card></Shell>
  ),
  notFoundComponent: () => <Shell><div className="p-6">Não encontrado</div></Shell>,
  component: DetectorPage,
});

const VERDICT: Record<Verdict, { label: string; tone: "success" | "warning" | "destructive" | "muted"; icon: React.ReactNode }> = {
  ok:            { label: "Sem bloqueio",       tone: "success",     icon: <CheckCircle2 className="h-4 w-4" /> },
  dns_blocked:   { label: "DNS bloqueado",       tone: "destructive", icon: <ShieldOff className="h-4 w-4" /> },
  geo_blocked:   { label: "Possível geo-bloqueio", tone: "warning",   icon: <Globe className="h-4 w-4" /> },
  firewall:      { label: "Firewall / porta",    tone: "warning",     icon: <ShieldAlert className="h-4 w-4" /> },
  unreachable:   { label: "Inacessível",         tone: "destructive", icon: <AlertTriangle className="h-4 w-4" /> },
  inconclusive:  { label: "Inconclusivo",        tone: "muted",       icon: <AlertTriangle className="h-4 w-4" /> },
};

function DetectorPage() {
  const [host, setHost] = useState("");
  const mutation = useMutation({
    mutationFn: (h: string) => runBlockDetector({ data: { host: h } }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = host.trim();
    if (h.length < 3) return;
    mutation.mutate(h);
  };

  return (
    <Shell>
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">🚨 Detector de Bloqueios</h1>
        <p className="text-sm text-muted-foreground">
          Descubra se um domínio está sendo bloqueado por DNS, firewall ou geolocalização.
        </p>
      </header>

      <Card className="p-4">
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="ex: youtube.com, x.com, meusite.com.br"
            className="flex-1 font-mono"
            autoFocus
          />
          <Button type="submit" disabled={mutation.isPending || host.trim().length < 3}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2">{mutation.isPending ? "Testando…" : "Testar"}</span>
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground mt-2">
          Testes rodam a partir dos servidores do StreamMonitor. Resultado em cache por 5 minutos.
        </p>
      </Card>

      {mutation.isError && (
        <Card className="p-4 border-destructive/40 text-sm text-destructive">
          {(mutation.error as Error).message}
        </Card>
      )}

      {mutation.data && <Report report={mutation.data} />}

      {!mutation.data && !mutation.isPending && (
        <Card className="p-6 text-sm text-muted-foreground border-dashed">
          <p className="font-medium text-foreground mb-1">O que este detector faz?</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Consulta 4 resolvers DNS públicos (Cloudflare, Google, Quad9, OpenDNS) e compara respostas.</li>
            <li>Tenta acessar o domínio via HTTPS a partir dos nossos servidores.</li>
            <li>Combina os sinais para dizer se há bloqueio de DNS, firewall, geo-bloqueio ou tudo normal.</li>
          </ul>
        </Card>
      )}
    </Shell>
  );
}

function Report({ report }: { report: DetectorReport }) {
  const v = VERDICT[report.verdict];
  return (
    <div className="space-y-4">
      <Card className={cn(
        "p-5 border-l-4",
        v.tone === "success" && "border-l-success",
        v.tone === "warning" && "border-l-warning",
        v.tone === "destructive" && "border-l-destructive",
        v.tone === "muted" && "border-l-muted",
      )}>
        <div className="flex items-center gap-3 mb-2">
          <span className={cn(
            v.tone === "success" && "text-success",
            v.tone === "warning" && "text-warning",
            v.tone === "destructive" && "text-destructive",
            v.tone === "muted" && "text-muted-foreground",
          )}>{v.icon}</span>
          <h2 className="font-semibold text-lg">{v.label}</h2>
          <span className="ml-auto text-xs text-muted-foreground font-mono">{report.host}</span>
        </div>
        <p className="text-sm text-muted-foreground">{report.summary}</p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Wifi className="h-4 w-4" /> Resolvers DNS ({report.dns.filter((d) => d.ok).length}/{report.dns.length})
          </h3>
          <ul className="space-y-2">
            {report.dns.map((d) => (
              <li key={d.code} className="rounded-md border border-border/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={d.ok ? "text-success" : "text-destructive"}>
                      {d.ok ? <CheckCircle2 className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.name}</div>
                      <div className="text-[11px] text-muted-foreground">{d.country}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs">{d.latencyMs != null ? `${d.latencyMs}ms` : "—"}</div>
                    <Badge variant={d.ok ? "outline" : "destructive"} className={cn("text-[10px]", d.ok && "text-success border-success/40")}>
                      {d.ok ? "resolveu" : d.error ?? "falhou"}
                    </Badge>
                  </div>
                </div>
                {d.answers.length > 0 && (
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground break-all">
                    {d.answers.join(", ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Globe className="h-4 w-4" /> Acesso HTTPS
          </h3>
          <dl className="text-sm space-y-2">
            <Row label="Status" value={report.http.status != null ? String(report.http.status) : "—"} />
            <Row label="Latência" value={report.http.latencyMs != null ? `${report.http.latencyMs}ms` : "—"} />
            <Row label="Seguiu redirect" value={report.http.redirected ? "Sim" : "Não"} />
            <Row label="URL final" value={report.http.finalUrl ?? "—"} mono />
            {report.http.error && <Row label="Erro" value={report.http.error} tone="destructive" />}
          </dl>

          {report.distinct_ips.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">IPs distintos observados</div>
              <div className="font-mono text-xs break-all">{report.distinct_ips.join(", ")}</div>
            </div>
          )}
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Gerado em {new Date(report.generated_at).toLocaleString()}
      </p>
    </div>
  );
}

function Row({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "destructive" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">{label}</dt>
      <dd className={cn("text-right truncate", mono && "font-mono text-xs", tone === "destructive" && "text-destructive")}>{value}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur bg-background/70 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/radar" className="text-muted-foreground hover:text-foreground">Radar</Link>
            <Link to="/detector" className="text-foreground font-medium">Detector</Link>
            <Link to="/auth" className="text-muted-foreground hover:text-foreground">Entrar</Link>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">{children}</main>
    </div>
  );
}
