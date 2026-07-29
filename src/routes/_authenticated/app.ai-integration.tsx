import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Lock, CheckCircle2, ShieldCheck, CreditCard, ExternalLink, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/app/ai-integration")({
  head: () => ({
    meta: [
      { title: "Integração com IA — Stream Monitor" },
      { name: "description", content: "Conecte sua conta Stream Monitor ao ChatGPT e Claude via MCP." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiIntegrationPage,
});

const MCP_URL = "https://streammonitor.site/mcp";

function AiIntegrationPage() {
  const sub = useSubscription();
  const isActive = !!sub.data?.isActive;

  const activity = useQuery({
    queryKey: ["mcp-activity"],
    enabled: isActive,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return [];
      const { data } = await (supabase as any)
        .from("mcp_activity_log")
        .select("id, tool, outcome, detail, client_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Array<{ id: string; tool: string; outcome: string; detail: string | null; client_id: string | null; created_at: string }>;
    },
    refetchInterval: 20_000,
  });

  const lastUsed = activity.data?.[0]?.created_at ?? null;

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-start gap-4 flex-wrap">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">Integração com Inteligência Artificial</h1>
            <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Beta</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte sua conta ao <strong>ChatGPT</strong>, <strong>Claude</strong> e outros assistentes compatíveis
            com o Model Context Protocol (MCP). Recurso <strong>exclusivo para assinantes ativos</strong>.
          </p>
        </div>
      </header>

      {!isActive && (
        <Card className="p-6 border-dashed text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Recurso exclusivo para assinantes</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ative seu plano para conectar sua conta ao ChatGPT e Claude.
            </p>
          </div>
          <Link to="/app/subscription">
            <Button><CreditCard className="h-4 w-4 mr-2" />Ver planos</Button>
          </Link>
        </Card>
      )}

      {isActive && (
        <>
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="font-semibold">Integração pronta para uso</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Endpoint MCP</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs break-all">{MCP_URL}</code>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(MCP_URL); toast.success("URL copiada"); }}>Copiar</Button>
                </div>
              </div>
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Última utilização</p>
                <p className="text-sm">{lastUsed ? formatDistanceToNow(new Date(lastUsed), { addSuffix: true, locale: ptBR }) : "Ainda não utilizado"}</p>
              </div>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <ConnectCard
              title="Conectar ao ChatGPT"
              description="Adicione o Stream Monitor como conector personalizado no ChatGPT (Plus / Team / Enterprise)."
              steps={[
                "Abra o ChatGPT e vá em Configurações → Conectores.",
                "Clique em 'Adicionar conector personalizado'.",
                `Cole a URL: ${MCP_URL}`,
                "Autorize com sua conta Stream Monitor.",
              ]}
              openUrl="https://chatgpt.com/#settings/Connectors"
              openLabel="Abrir ChatGPT"
            />
            <ConnectCard
              title="Conectar ao Claude"
              description="Adicione o Stream Monitor como conector personalizado no Claude (Pro / Team / Enterprise)."
              steps={[
                "Abra o Claude e vá em Configurações → Conectores.",
                "Clique em 'Adicionar conector personalizado'.",
                `Cole a URL: ${MCP_URL}`,
                "Autorize com sua conta Stream Monitor.",
              ]}
              openUrl="https://claude.ai/settings/connectors"
              openLabel="Abrir Claude"
            />
          </div>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Exemplos de comandos</h2>
            <ul className="text-sm space-y-1.5 text-muted-foreground list-disc pl-5">
              <li>"Mostre minhas DNS offline."</li>
              <li>"Cadastre uma nova DNS chamada Servidor SP com host 1.2.3.4."</li>
              <li>"Quais servidores apresentaram mais quedas nos últimos 7 dias?"</li>
              <li>"Mostre os alertas das últimas 24 horas."</li>
              <li>"Gere um relatório das minhas DNS."</li>
              <li>"Consulte o status da minha assinatura."</li>
            </ul>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Como revogar o acesso</h2>
            <p className="text-sm text-muted-foreground">
              Você pode desconectar o Stream Monitor do ChatGPT ou do Claude a qualquer momento,
              diretamente nas <strong>Configurações → Conectores</strong> do respectivo aplicativo.
              Após revogar, nenhuma ação poderá ser executada pela IA em seu nome.
            </p>
            <p className="text-sm text-muted-foreground">
              O acesso também é <strong>bloqueado automaticamente</strong> caso sua assinatura vença,
              seja cancelada ou fique inativa — até que você renove.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><Bot className="h-4 w-4" /> Histórico de ações executadas pela IA</h2>
            {activity.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {activity.data && activity.data.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
            )}
            {activity.data && activity.data.length > 0 && (
              <div className="border rounded-md divide-y max-h-80 overflow-y-auto">
                {activity.data.map((row) => (
                  <div key={row.id} className="p-3 flex items-start gap-3 text-sm">
                    <Badge variant={row.outcome === "ok" ? "secondary" : "destructive"} className="shrink-0">
                      {row.outcome === "ok" ? "OK" : "Erro"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs">{row.tool}</p>
                      {row.detail && <p className="text-xs text-muted-foreground truncate">{row.detail}</p>}
                      <p className="text-[11px] text-muted-foreground">
                        {row.client_id ?? "cliente desconhecido"} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ConnectCard({ title, description, steps, openUrl, openLabel }: { title: string; description: string; steps: string[]; openUrl: string; openLabel: string }) {
  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <ol className="text-sm space-y-1.5 list-decimal pl-5">
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
      <a href={openUrl} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="w-full sm:w-auto"><ExternalLink className="h-4 w-4 mr-2" />{openLabel}</Button>
      </a>
    </Card>
  );
}
