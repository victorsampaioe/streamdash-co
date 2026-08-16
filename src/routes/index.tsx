import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState, useRef } from "react";
import { Activity, Bell, Globe, Zap, ShieldCheck, LineChart, Send, BookOpen, UserCheck, TrendingUp, Search, Film, Tv, CheckCircle2, Cpu, PlayCircle, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
const SupportFab = lazy(() => import("@/components/support-fab").then(m => ({ default: m.SupportFab })));
import heroVideoAsset from "@/assets/hero-video.mp4.asset.json";
import poster_duneAsset from "@/assets/radar/dune.jpg.asset.json";
import poster_godzillaAsset from "@/assets/radar/godzilla.jpg.asset.json";
import poster_madamewebAsset from "@/assets/radar/madameweb.jpg.asset.json";
import poster_apesAsset from "@/assets/radar/apes.jpg.asset.json";
import poster_theboysAsset from "@/assets/radar/theboys.jpg.asset.json";
import poster_hotdAsset from "@/assets/radar/hotd.jpg.asset.json";
import poster_tlouAsset from "@/assets/radar/tlou.jpg.asset.json";
import poster_stAsset from "@/assets/radar/st.jpg.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Stream Monitor | Monitoramento IPTV, DNS e Servidores" },
      { name: "description", content: "Plataforma de monitoramento 24h para servidores IPTV, DNS e infraestrutura. Receba alertas inteligentes no Telegram e evite reclamações." },
      { property: "og:title", content: "Stream Monitor | Monitoramento IPTV e DNS" },
      { property: "og:description", content: "Monitore servidores IPTV e DNS 24 horas. Alertas no Telegram e diagnóstico inteligente." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Stream Monitor | Monitoramento Profissional" },
      { name: "twitter:description", content: "Evite quedas no seu servidor IPTV com nosso monitoramento inteligente." },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
    ],
  }),
  component: Landing,
  loader: async ({ context }) => {
    // Pré-carrega dados críticos se necessário no futuro
  }
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main>
      <header className="border-b border-border/60 backdrop-blur bg-background/70 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4 gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            <span className="font-bold tracking-tight">stream<span className="text-primary">monitor</span></span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/blog" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" className="gap-2">
                <BookOpen className="h-4 w-4" />Blog
              </Button>
            </Link>
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex gap-2">
                <Send className="h-4 w-4" />Telegram
              </Button>
            </a>
            <Link to="/auth"><Button variant="ghost" size="sm">Entrar</Button></Link>
            <Link to="/auth"><Button size="sm">Começar</Button></Link>
          </div>

        </div>
      </header>

      <section className="grid-bg relative">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6 sm:mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            Monitoramento ativo a cada 30 segundos
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-4 sm:mb-6 break-words">
            Seu servidor IPTV caiu?<br />
            <span className="text-primary">Descubra antes dos seus clientes.</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-10 px-2">
            Monitoramento inteligente de IPTV, DNS e servidores com alertas automáticos no Telegram.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4">
            <Link to="/auth" className="w-full sm:w-auto"><Button size="lg" className="w-full sm:w-auto glow-primary">✅ Testar sistema</Button></Link>
            <Link to="/auth" className="w-full sm:w-auto"><Button size="lg" variant="outline" className="w-full sm:w-auto">✅ Seja revendedor</Button></Link>
          </div>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { k: "30s", v: "Intervalo de checagem" },
              { k: "4", v: "Regiões globais" },
              { k: "< 1 min", v: "Alerta após a falha" },
              { k: "24/7", v: "Vigilância contínua" },
            ].map((m) => (
              <div key={m.v} className="rounded-xl border border-border/60 bg-card/50 px-4 py-3">
                <div className="text-xl font-bold text-primary">{m.k}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      <RadarShowcase />

      <section id="recursos" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Por que usar o Stream Monitor?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Feature icon={<Zap className="h-5 w-5" />} title="✅ Monitoramento 24 horas" desc="DNS, HTTP, latência e certificado SSL conferidos sem parar, de várias regiões." />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} title="✅ Inteligência de diagnóstico" desc="Sistema anti-falso positivo com burst de confirmação e análise detalhada de falhas." />
          <Feature icon={<Bell className="h-5 w-5" />} title="✅ Alertas Telegram" desc="Receba notificações instantâneas no seu Telegram antes dos seus clientes perceberem." />
          <Feature icon={<Activity className="h-5 w-5" />} title="✅ Monitoramento IPTV real" desc="Monitoramento dedicado de painéis IPTV com Health Score exclusivo e verificação de fluxo." />
          <Feature icon={<Globe className="h-5 w-5" />} title="✅ Análise de conteúdo" desc="Acompanhe conteúdos recentes e status de servidores IPTV com integração TMDB." />
          <Feature icon={<LineChart className="h-5 w-5" />} title="✅ Sistema para revendedores" desc="Estrutura completa para gerenciar sub-revendas com sistema de créditos independente." />
          <Feature icon={<PlayCircle className="h-5 w-5" />} title="🚀 Novo Módulo: Player Inteligente" desc="Web Player premium com busca global, Hero banners cinematográficos e carregamento progressivo para sua marca." />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="text-3xl font-bold text-center mb-12">Prova Social</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          <Stat label="Servidores monitorados" value="1.240+" />
          <Stat label="Checagens realizadas" value="4.5M+" />
          <Stat label="Alertas enviados" value="850k+" />
          <Stat label="Revendedores ativos" value="320+" />
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-t border-border/60" itemScope itemType="https://schema.org/FAQPage">
        <h2 className="text-3xl font-bold text-center mb-12 text-primary">Perguntas Frequentes (FAQ)</h2>
        <div className="space-y-6">
          <FaqItem question="O que é o Stream Monitor?" answer="O Stream Monitor é uma plataforma profissional de monitoramento 24h para servidores IPTV, DNS e infraestrutura, com foco em diagnóstico inteligente e alertas instantâneos." />
          <FaqItem question="Como funciona o monitoramento IPTV?" answer="O sistema verifica a disponibilidade da API, status de fluxos e gera um Health Score exclusivo de 0 a 100%, alertando sobre qualquer instabilidade detectada." />
          <FaqItem question="Recebo alertas no Telegram?" answer="Sim! O Stream Monitor envia notificações em tempo real no Telegram, permitindo que você resolva problemas antes que seus clientes percebam." />
          <FaqItem question="Posso usar para revenda?" answer="Sim, oferecemos um sistema completo para revendedores gerenciarem suas próprias redes de monitoramento com autonomia e lucratividade." />
          <FaqItem question="Como contratar?" answer="Basta criar uma conta, escolher seu plano ou adquirir créditos e começar a monitorar sua infraestrutura em segundos." />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-3">Pronto para profissionalizar sua operação?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Junte-se a centenas de revendedores que não perdem mais tempo respondendo reclamação de queda.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/auth"><Button size="lg" className="glow-primary">✅ Começar agora</Button></Link>
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="gap-2">
                <Send className="h-4 w-4" />Canal de Novidades
              </Button>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span>© {new Date().getFullYear()} streammonitor.site</span>
          <div className="flex items-center gap-4">
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-1.5">
              <Send className="h-4 w-4" />Novidades no Telegram
            </a>
            <Link to="/monitoramento-iptv" className="hover:text-primary">Monitoramento IPTV</Link>
            <Link to="/monitoramento-dns" className="hover:text-primary">Monitoramento DNS</Link>
            <Link to="/alertas-telegram" className="hover:text-primary">Alertas</Link>
            <Link to="/revendedor-stream-monitor" className="hover:text-primary">Revenda</Link>
            <Link to="/blog" className="hover:text-primary">Blog</Link>
            <Link to="/auth" className="hover:text-primary">Entrar</Link>
          </div>
        </div>
      </footer>

      </main>
      <Suspense fallback={<div className="h-20" />}>
        <SupportFab />
      </Suspense>
    </div>
  );
}


function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-primary mb-1">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-6 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="font-bold mb-2 flex items-center gap-2 text-primary" itemProp="mainEntity" itemScope itemType="https://schema.org/Question">
        <span className="h-2 w-2 rounded-full bg-primary" />
        <span itemProp="name">{question}</span>
      </h3>
      <div itemProp="acceptedAnswer" itemScope itemType="https://schema.org/Answer">
        <p className="text-sm text-muted-foreground leading-relaxed" itemProp="text">{answer}</p>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-6 hover:border-primary/50 transition-colors">
      <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center text-primary mb-4">{icon}</div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function RadarShowcase() {
  const films = [
    {
      title: "Duna: Parte Dois",
      image: poster_duneAsset.url,
      status: "Novo conteúdo detectado",
      detected: "Hoje 14:32",
      servers: 8,
      available: true,
      tag: "⚡ Detectado agora"
    },
    {
      title: "Godzilla e Kong: O Novo Império",
      image: poster_godzillaAsset.url,
      status: "Disponível",
      detected: "Hoje 12:15",
      servers: 12,
      available: true
    },
    {
      title: "Madame Teia",
      image: poster_madamewebAsset.url,
      status: "Disponível",
      detected: "Ontem",
      servers: 5,
      available: true
    },
    {
      title: "Planeta dos Macacos: O Reinado",
      image: poster_apesAsset.url,
      status: "Detectado recentemente",
      detected: "Há 2 horas",
      servers: 15,
      available: true
    }
  ];

  const series = [
    {
      title: "The Boys",
      image: poster_theboysAsset.url,
      info: "Temporada 4",
      status: "Atualização: Agora",
      servers: 7,
      tag: "⚡ Detectado agora"
    },
    {
      title: "House of the Dragon",
      image: poster_hotdAsset.url,
      info: "Temporada 2",
      status: "Nova temporada detectada",
      servers: 11
    },
    {
      title: "The Last of Us",
      image: poster_tlouAsset.url,
      info: "S02 E01",
      status: "Novo episódio encontrado",
      servers: 4
    },
    {
      title: "Stranger Things",
      image: poster_stAsset.url,
      info: "Temporada 5",
      status: "Atualização recente",
      servers: 9
    }
  ];

  return (
    <section className="relative overflow-hidden border-y border-border/40 bg-card/20 py-20">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative text-center">
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-primary text-xs font-semibold mb-4 border border-primary/20 animate-pulse">
            <Cpu className="h-3.5 w-3.5" />
            <span>Inteligência de Conteúdo IPTV</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 tracking-tight">
            Radar de Conteúdo IPTV
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-4">
            "Nossa inteligência analisa milhares de conteúdos e identifica onde novos filmes e séries aparecem primeiro."
          </p>
          <p className="text-muted-foreground/80 italic text-sm">
            "Descubra novos filmes e séries encontrados na sua rede antes dos seus clientes."
          </p>
        </div>

        {/* Filmes Section */}
        <div className="mb-16 text-left">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Film className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight">🎬 Filmes encontrados recentemente</h3>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {films.map((item, idx) => (
              <div key={idx} className="group relative rounded-xl border border-border/60 bg-card/40 overflow-hidden transition-all hover:border-primary/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10">
                <div className="aspect-[2/3] relative overflow-hidden">
                  <img src={item.image} alt={item.title} width={300} height={450} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60" />
                  
                  {item.tag && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary text-[9px] font-bold text-black animate-pulse uppercase tracking-tighter">
                      {item.tag}
                    </div>
                  )}
                  
                  {item.available && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold text-success drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      🟢 DISPONÍVEL
                    </div>
                  )}
                </div>
                
                <div className="p-3 sm:p-4">
                  <h4 className="font-bold text-sm sm:text-base mb-1 truncate">{item.title}</h4>
                  <div className="text-[10px] text-primary/80 mb-2 font-medium uppercase tracking-wider">{item.status}</div>
                  
                  <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Detectado</span>
                      <span className="text-foreground">{item.detected}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Rede</span>
                      <span className="text-primary font-medium flex items-center gap-1">
                        <Globe className="h-2.5 w-2.5" /> 🌎 {item.servers} servidores
                      </span>
                    </div>
                  </div>
                </div>
                {idx === 0 && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden">
                    <div className="h-full w-full bg-primary/50 animate-scan" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Séries Section */}
        <div className="mb-16 text-left">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Tv className="h-6 w-6" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight">📺 Séries atualizadas</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {series.map((item, idx) => (
              <div key={idx} className="group relative rounded-xl border border-border/60 bg-card/40 overflow-hidden transition-all hover:border-primary/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10">
                <div className="aspect-[2/3] relative overflow-hidden">
                  <img src={item.image} alt={item.title} width={300} height={450} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-60" />
                  
                  {item.tag && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-primary text-[9px] font-bold text-black animate-pulse uppercase tracking-tighter">
                      {item.tag}
                    </div>
                  )}
                  
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-[10px] font-bold text-white backdrop-blur-md">
                    {item.info}
                  </div>
                  
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] font-bold text-success drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    🟢 DISPONÍVEL
                  </div>
                </div>
                
                <div className="p-3 sm:p-4">
                  <h4 className="font-bold text-sm sm:text-base mb-1 truncate">{item.title}</h4>
                  <div className="text-[10px] text-primary/80 mb-2 font-medium uppercase tracking-wider">{item.status}</div>
                  
                  <div className="flex flex-col gap-1.5 text-[10px] text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Rede</span>
                      <span className="text-primary font-medium flex items-center gap-1">
                        <Globe className="h-2.5 w-2.5" /> 🌎 {item.servers} servidores
                      </span>
                    </div>
                  </div>
                </div>
                {idx === 0 && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] overflow-hidden">
                    <div className="h-full w-full bg-primary/50 animate-[scan_3s_infinite_linear_reverse]" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <Link to="/auth">
            <Button size="lg" className="glow-primary px-8 gap-2 h-12 text-base">
              <Search className="h-5 w-5" />
              Conhecer Inteligência de Conteúdo
            </Button>
          </Link>
          <p className="mt-6 text-xs text-muted-foreground italic flex items-center justify-center gap-2">
            <ShieldCheck className="h-3 w-3" />
            * Demonstração com dados fictícios para fins de marketing.
          </p>
        </div>
      </div>
    </section>
  );
}

