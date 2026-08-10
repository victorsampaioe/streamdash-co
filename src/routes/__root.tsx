import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { installChunkRecovery } from "@/lib/chunk-recovery";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A rota que você tentou acessar não existe.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente em instantes.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Stream Monitor | Monitoramento IPTV, DNS e Servidores em Tempo Real" },
      { name: "description", content: "Monitore servidores IPTV, DNS e infraestrutura 24 horas. Receba alertas inteligentes no Telegram e descubra problemas antes dos seus clientes." },
      { property: "og:site_name", content: "Stream Monitor" },
      { property: "og:title", content: "Stream Monitor | Monitoramento IPTV, DNS e Servidores em Tempo Real" },
      { property: "og:description", content: "Monitore servidores IPTV, DNS e infraestrutura 24 horas. Receba alertas inteligentes no Telegram e descubra problemas antes dos seus clientes." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Stream Monitor | Monitoramento IPTV, DNS e Servidores em Tempo Real" },
      { name: "twitter:description", content: "Monitore servidores IPTV, DNS e infraestrutura 24 horas. Receba alertas inteligentes no Telegram e descubra problemas antes dos seus clientes." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Stream Monitor",
      "url": "https://streammonitor.site",
      "logo": "https://streammonitor.site/favicon.ico",
      "description": "Plataforma de monitoramento profissional para IPTV, DNS e infraestrutura."
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Stream Monitor",
      "operatingSystem": "Web",
      "applicationCategory": "InfrastructureMonitoring",
      "description": "Monitore servidores IPTV, DNS e infraestrutura 24 horas com alertas inteligentes no Telegram.",
      "offers": {
        "@type": "Offer",
        "price": "25.00",
        "priceCurrency": "BRL"
      }
    }
  ];

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => installChunkRecovery(), []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);


  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
