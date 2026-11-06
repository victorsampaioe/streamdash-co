import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, Clock, Tag } from "lucide-react";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog de Monitoramento IPTV, DNS e Servidores | Stream Monitor" },
      { name: "description", content: "Guias práticos sobre monitoramento de servidores IPTV, diagnóstico de falhas DNS e alertas para revendedores. Aprenda a investigar indisponibilidades." },
      { property: "og:title", content: "Guias de Monitoramento IPTV | Stream Monitor" },
      { property: "og:description", content: "Aprenda a investigar quedas de servidores IPTV, DNS e instabilidades com guias práticos." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site/blog" },
    ],
    links: [{ rel: "canonical", href: "https://streammonitor.site/blog" }],
  }),
  component: BlogRoute,
});

const posts = [
  {
    slug: "como-evitar-queda-iptv",
    title: "Como reduzir o impacto de quedas IPTV: guia para revendedores",
    description: "Aprenda a monitorar disponibilidade, latência, API, DNS e incidentes para identificar problemas com mais rapidez.",
    category: "Monitoramento IPTV",
  },
  {
    slug: "como-saber-se-servidor-iptv-caiu",
    title: "Como saber se um servidor IPTV caiu? Passo a passo",
    description: "Diferencie erro de DNS, indisponibilidade HTTP, bloqueio de API e problema na rede do cliente.",
    category: "Diagnóstico",
  },
  {
    slug: "dns-iptv-nao-resolve",
    title: "DNS IPTV não resolve: causas, testes e como investigar",
    description: "Entenda NXDOMAIN, propagação, troca de IP, falhas de resolvedores e os sinais de uma queda real.",
    category: "DNS",
  },
];

// As rotas blog.* são filhas da rota /blog. Sem <Outlet/> o TanStack
// mantinha a lista do blog na tela, mesmo ao abrir o URL de um artigo.
function BlogRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.replace(/\/+$/, "") === "/blog" ? <BlogPage /> : <Outlet />;
}

function BlogPage() {
  return (
    <main className="min-h-screen bg-background text-foreground px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="mb-8 inline-block text-sm text-primary hover:underline">← Voltar ao Stream Monitor</Link>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">Guias gratuitos</p>
        <h1 className="mb-4 text-3xl font-bold sm:text-5xl">Blog de monitoramento IPTV, DNS e servidores</h1>
        <p className="mb-10 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Material prático para revendedores e administradores: identifique a origem de instabilidades, acompanhe seus servidores e organize alertas sem confundir um erro local com uma queda geral.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          {posts.map(post => (
            <Link key={post.slug} to={`/blog/${post.slug}` as "/blog/como-evitar-queda-iptv"}
              className="group block rounded-2xl border border-border/70 bg-card/50 p-6 transition-colors hover:border-primary/50">
              <span className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-primary"><Tag className="h-3.5 w-3.5" /> {post.category}</span>
              <h2 className="mb-3 text-xl font-bold leading-snug group-hover:text-primary">{post.title}</h2>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{post.description}</p>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Ler guia <BookOpen className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
        <section className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
          <h2 className="mb-3 text-2xl font-bold">Precisa monitorar sua infraestrutura?</h2>
          <p className="mb-5 text-muted-foreground">Conheça o monitoramento de servidores IPTV e a verificação de DNS disponíveis no Stream Monitor.</p>
          <div className="flex flex-wrap gap-4 text-sm font-medium text-primary">
            <Link to="/monitoramento-iptv" className="underline">Monitoramento IPTV</Link>
            <Link to="/monitoramento-dns" className="underline">Monitoramento DNS</Link>
            <Link to="/revendedor-stream-monitor" className="underline">Soluções para revendedores</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
