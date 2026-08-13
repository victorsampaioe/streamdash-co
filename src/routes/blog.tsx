import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, Clock, Tag } from "lucide-react";

export const Route = createFileRoute('/blog')({
  head: () => ({
    meta: [
      { title: "Blog Stream Monitor - Dicas de Monitoramento e IPTV" },
      { name: "description", content: "Leia as últimas notícias sobre infraestrutura, dicas para evitar quedas e guias sobre monitoramento inteligente." },
    ],
  }),
  component: BlogPage,
});

function BlogPage() {
  const posts = [
    { slug: 'como-evitar-queda-iptv', title: '🚀 Novo Módulo: Player Inteligente (Web Player do Stream Monitor)', date: '13/08/2026', category: 'Novidade' },
    { slug: 'como-evitar-queda-iptv', title: 'Como evitar queda IPTV: Guia Definitivo', date: '10/08/2026', category: 'IPTV' },
    { slug: 'por-que-monitorar-servidores', title: 'Por que monitorar servidores é vital para seu negócio', date: '08/08/2026', category: 'Negócios' },
    { slug: 'diferenca-dns-servidor', title: 'Diferença entre queda de DNS e queda de Servidor', date: '05/08/2026', category: 'Técnico' },
    { slug: 'alerta-telegram-importancia', title: 'Como funciona o alerta Telegram e por que ele é o melhor', date: '02/08/2026', category: 'Alertas' },
  ];

  return (
    <main className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-4xl sm:text-5xl font-bold mb-12">Blog Stream Monitor</h1>
        
        <div className="grid gap-8">
          {posts.map(post => (
            <a key={post.slug} href={`/blog/${post.slug}`} className="group p-5 sm:p-6 bg-card/40 border border-border/60 rounded-2xl hover:border-primary/50 transition-all cursor-pointer block">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {post.date}</span>
                <span className="flex items-center gap-1 bg-primary/20 text-primary px-2 py-0.5 rounded-full"><Tag className="h-3 w-3" /> {post.category}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-2 group-hover:text-primary transition-colors">{post.title}</h2>
              <p className="text-sm sm:text-base text-muted-foreground mb-4">Descubra as melhores práticas para manter seu serviço estável e seus clientes satisfeitos...</p>
              <span className="text-primary font-semibold flex items-center gap-1">Ler mais <BookOpen className="h-4 w-4" /></span>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
