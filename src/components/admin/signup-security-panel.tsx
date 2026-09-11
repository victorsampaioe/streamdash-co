import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ShieldAlert, ShieldCheck, Ban, RefreshCw, ChevronDown, ChevronUp, Unlock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSignupSecurityReport, unblockSignup } from "@/lib/signup.functions";
import { toast } from "sonner";

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
  invalid_username: "Usuário inválido",
  duplicate_email: "E-mail duplicado",
  duplicate_username: "Usuário duplicado",
  duplicate_phone: "Telefone duplicado",
  duplicate_request: "Post duplicado",
  signup_failed: "Falha no cadastro",
};

const CATEGORY_LABELS: Record<string, string> = {
  created: "Cadastro criado",
  existing_account: "Usuário já existente",
  invalid_data: "Dados inválidos",
  internal_failure: "Falha interna",
  rate_limited: "Bloqueado por limite",
  turnstile: "Bloqueado pela verificação",
  bot: "Honeypot/bot",
  processing: "Em processamento",
};

export function SignupSecurityPanel() {
  const fetchReport = useServerFn(getSignupSecurityReport);
  const removeBlock = useServerFn(unblockSignup);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["signup-security-report"],
    queryFn: () => fetchReport(),
    refetchInterval: 60_000,
  });

  const reasons = Object.entries(data?.by_reason_24h ?? {}).sort((a, b) => b[1] - a[1]);
  const categories = Object.entries(data?.by_category_24h ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Proteção de Cadastros
          </h3>
          <p className="text-xs text-muted-foreground">
             Proteção adaptativa por identidade e rede, com validações e análise das últimas 24 horas.
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
             <Ban className="h-3 w-3 text-warning" /> Bloqueios ativos
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

      {categories.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Categorias (24h)</div>
          <div className="flex flex-wrap gap-2">
            {categories.map(([category, count]) => <Badge key={category} variant="secondary">{CATEGORY_LABELS[category] ?? category}: {count}</Badge>)}
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
          {(data?.recent ?? []).map((r) => (
            <div key={r.id} className="p-3 text-xs">
              <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <Badge variant={r.status === "created" ? "default" : "destructive"}>{CATEGORY_LABELS[r.category] ?? REASON_LABELS[r.reason ?? ""] ?? "Rejeitada"}</Badge>
                <span className="font-mono text-muted-foreground">{r.ip_masked ?? "—"}</span>
                <span className="truncate max-w-[220px]">{r.email ?? "—"}</span>
                <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                {expanded === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {expanded === r.id && <div className="mt-3 grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                <div><span className="text-muted-foreground">Motivo:</span> {REASON_LABELS[r.reason ?? ""] ?? r.reason ?? "—"}</div>
                <div><span className="text-muted-foreground">Risco:</span> {r.risk_score ?? 0}</div>
                <div><span className="text-muted-foreground">Nome:</span> {r.full_name ?? "—"}</div>
                <div><span className="text-muted-foreground">Telefone:</span> {r.phone ?? "—"}</div>
                <div className="sm:col-span-2 break-words"><span className="text-muted-foreground">Detalhe técnico:</span> {r.technical_detail ?? "Sem detalhe adicional"}</div>
                <div className="sm:col-span-2 break-words"><span className="text-muted-foreground">Navegador:</span> {r.user_agent ?? "—"}</div>
              </div>}
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
               <Button size="sm" variant="outline" onClick={async () => { try { await removeBlock({ data: { key: b.key } }); toast.success("Bloqueio removido"); refetch(); } catch { toast.error("Não foi possível remover o bloqueio"); } }}><Unlock className="h-3 w-3" /> Liberar</Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
