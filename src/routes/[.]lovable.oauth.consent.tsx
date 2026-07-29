// Managed Supabase OAuth 2.1 consent page for MCP clients.
// The path with a dot must be escaped: [.]lovable.oauth.consent → /.lovable/oauth/consent
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, ShieldCheck, XCircle } from "lucide-react";

type SupabaseOAuthAuthorizationDetails = {
  redirect_url?: string | null;
  redirect_to?: string | null;
  client?: { name?: string | null } | null;
  scope?: string[] | null;
};

type SupabaseOAuthResult = {
  data: SupabaseOAuthAuthorizationDetails | null;
  error: { message: string } | null;
};

type SupabaseOAuthClient = {
  getAuthorizationDetails: (authorizationId: string) => Promise<SupabaseOAuthResult>;
  approveAuthorization: (authorizationId: string) => Promise<SupabaseOAuthResult>;
  denyAuthorization: (authorizationId: string) => Promise<SupabaseOAuthResult>;
};

function oauth(): SupabaseOAuthClient {
  return (supabase.auth as unknown as { oauth: SupabaseOAuthClient }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { redirect: next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full p-6 space-y-2">
        <XCircle className="h-8 w-8 text-destructive" />
        <h1 className="text-lg font-semibold">Não foi possível carregar esta autorização</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Servidor de autorização não retornou uma URL de redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "um aplicativo";

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/40">
      <Card className="max-w-md w-full p-6 space-y-5">
        <div className="flex items-center gap-2 text-primary">
          <Activity className="h-5 w-5" />
          <span className="font-semibold">Stream Monitor</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Conectar {clientName} à sua conta?</h1>
          <p className="text-sm text-muted-foreground">
            Isso permite que <strong>{clientName}</strong> use o Stream Monitor em seu nome:
            listar suas DNS, consultar status, criar alertas, gerar relatórios e outras
            ações através do MCP.
          </p>
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground flex gap-2 items-start">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>
            Você pode revogar o acesso a qualquer momento em <code>/app/ai-integration</code>.
            Recurso disponível apenas para assinantes ativos.
          </span>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>Negar</Button>
          <Button disabled={busy} onClick={() => decide(true)}>Autorizar</Button>
        </div>
      </Card>
    </main>
  );
}
