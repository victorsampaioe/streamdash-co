import { createFileRoute, Outlet, redirect, isRedirect, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { user: data.user };

      // Network hiccup or expired access token: fall back to the stored session
      // before deciding the user is really signed out.
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) return { user: sessionData.session.user };

      throw redirect({ to: "/auth" });
    } catch (err) {
      if (isRedirect(err)) throw err;
      // Never bubble transient auth/network failures to the root error boundary.
      const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }) as never);
      if (sessionData?.session?.user) return { user: sessionData.session.user };
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
  errorComponent: AuthedError,
});

function AuthedError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Não foi possível carregar o painel</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verifique sua conexão e tente novamente.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a href="/auth" className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent">
            Entrar de novo
          </a>
        </div>
      </div>
    </div>
  );
}
