import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, ShieldCheck, Ban, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSignupSecurityReport } from "@/lib/signup.functions";

const REASON_LABELS: Record<string, string> = {
  rate_limit_exceeded: "Rate limit",
  temporarily_blocked: "IP bloqueado",
  turnstile_rejected: "Turnstile",
  honeypot_triggered: "Honeypot (bot)",
  invalid_phone: "Telefone inválido",
  invalid_name: "Nome inválido",
  invalid_email: "E-mail inválido",
  invalid_referral: "Indicação inválida",
  invalid_password: "Senha inválida",
  duplicate_email: "E-mail duplicado",
  duplicate_phone: "Telefone duplicado",
  duplicate_request: "Post duplicado",
  signup_failed: "Falha no cadastro",
};

export function SignupSecurityPanel() {
  const fetchReport = useServerFn(getSignupSecurityReport);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["signup-security-report"],
    queryFn: () => fetchReport(),
    refetchInterval: 60_000,
  });

  const reasons = Object.entries(data?.by_reason_24h ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Proteção de Cadastros
          </h3>
          <p className="text-xs text-muted-foreground">
            Rate limit (3/10min · 5/1h por IP), Turnstile, honeypot e validações — últimas 24h.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-success" /> Contas válidas (24h)
          </div>
          <div className="text-2xl font-bold">{isLoading ? "—" : data?.created_24h ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-destructive" /> Tentativas bloqueadas (24h)
          </div>
          <div className="text-2xl font-bold">{isLoading ? "—" : data?.rejected_24h ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Ban className="h-3 w-3 text-warning" /> IPs em bloqueio ativo
          </div>
          <div className="text-2xl font-bold">{isLoading ? "—" : data?.active_blocks?.length ?? 0}</div>
        </Card>
      </div>

      {reasons.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Motivos de rejeição (24h)</div>
          <div className="flex flex-wrap gap-2">
            {reasons.map(([reason, count]) => (
              <Badge key={reason} variant="outline">
                {REASON_LABELS[reason] ?? reason}: {count}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60 text-xs font-medium text-muted-foreground">
          Tentativas recentes
        </div>
        <div className="divide-y divide-border/50 max-h-[420px] overflow-y-auto">
          {(data?.recent ?? []).length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">
              {isLoading ? "Carregando..." : "Nenhuma tentativa registrada."}
            </div>
          )}
          {(data?.recent ?? []).map((r, i) => (
            <div key={i} className="p-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={r.status === "created" ? "default" : "destructive"}>
                {r.status === "created" ? "Criada" : REASON_LABELS[r.reason ?? ""] ?? "Rejeitada"}
              </Badge>
              <span className="font-mono text-muted-foreground">{r.ip_masked ?? "—"}</span>
              <span className="truncate max-w-[220px]">{r.email ?? "—"}</span>
              <span className="text-muted-foreground">{r.phone ?? "—"}</span>
              <span className="ml-auto text-muted-foreground">
                {new Date(r.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {(data?.active_blocks ?? []).length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Bloqueios ativos</div>
          {data!.active_blocks.map((b) => (
            <div key={b.key} className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="destructive">{REASON_LABELS[b.reason] ?? b.reason}</Badge>
              <span className="font-mono text-muted-foreground">{b.key.slice(0, 12)}…</span>
              <span>{b.attempts} tentativas</span>
              <span className="ml-auto text-muted-foreground">
                até {new Date(b.blocked_until).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
