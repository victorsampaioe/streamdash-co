import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState, useRef } from "react";
import { Activity, ArrowRight, ServerIcon, Bell, Globe, Zap, ShieldCheck, LineChart, Send, BookOpen, UserCheck, TrendingUp, Search, Film, Tv, CheckCircle2, Cpu, PlayCircle, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      { title: "Monitoramento IPTV para Revendedores | Stream Monitor" },
      { name: "description", content: "Monitore servidores IPTV e DNS, latência e falhas em um só painel. Alertas no Telegram e diagnóstico para revendedores. Conheça o Stream Monitor." },
      { property: "og:title", content: "Stream Monitor | Monitoramento de Servidores IPTV" },
      { property: "og:description", content: "Monitoramento IPTV para revendedores: servidores, DNS, latência e alertas no Telegram. Conheça a plataforma." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Stream Monitor | Monitoramento Profissional" },
      { name: "twitter:description", content: "Evite quedas no seu servidor IPTV com nosso monitoramento inteligente." },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
    ],
    links: [{ rel: "canonical", href: "https://streammonitor.site/" }],
  }),
  component: Landing,
  loader: async ({ context }) => {
    // Pré-carrega dados críticos se necessário no futuro
  }
});

function Landing() {
  return (
    <div className="sm-landing min-h-screen bg-background text-foreground">
      <main>
      <header className="border-b border-border/50 backdrop-blur-xl bg-background/85 sticky top-0 z-40">
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

      <section className="sm-hero relative overflow-hidden border-b border-border/50 bg-background">
        <div className="pointer-events-none absolute right-[-10%] top-[-20%] h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-32">
          <div className="space-y-7">
            <div className="sm-hero-badge inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold uppercase tracking-[.15em] text-primary">
              <Activity className="h-4 w-4" /> Plataforma de observabilidade
            </div>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.07] tracking-[-.055em] sm:text-5xl xl:text-6xl">
              Monitoramento IPTV e DNS
              <span className="mt-2 block text-primary">para revendedores.</span>
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              Monitoramento IPTV para revendedores: acompanhe servidores, DNS, latência e disponibilidade. Receba alertas e investigue falhas em um painel profissional.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/auth"><Button size="lg" className="sm-primary-cta h-12 w-full px-7 sm:w-auto">Começar a monitorar <Activity className="ml-2 h-4 w-4" /></Button></Link>
              <Link to="/revendedor-stream-monitor"><Button variant="outline" size="lg" className="h-12 w-full px-7 sm:w-auto">Soluções para revendedores</Button></Link>
            </div>
            <div className="grid max-w-lg grid-cols-3 gap-3 border-t border-border/60 pt-6">
              <div><p className="font-bold text-foreground">DNS</p><p className="text-xs text-muted-foreground">Disponibilidade</p></div>
              <div><p className="font-bold text-foreground">HTTP</p><p className="text-xs text-muted-foreground">Latência e resposta</p></div>
              <div><p className="font-bold text-foreground">IPTV</p><p className="text-xs text-muted-foreground">Diagnóstico</p></div>
            </div>
          </div>
          <PresentationVideo />
        </div>
      </section>

      <RadarShowcase />

      <section aria-labelledby="solucoes-monitoramento" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="mb-7">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">Monitoramento para sua operação</p>
          <h2 id="solucoes-monitoramento" className="text-3xl font-bold">Descubra o que está causando instabilidade nos seus servidores</h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">Cada problema exige um diagnóstico diferente. Monitore a resolução de nomes, a disponibilidade da aplicação e as notificações para agir com informações verificáveis.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/monitoramento-iptv" className="rounded-2xl border border-border/70 bg-card/50 p-6 transition-colors hover:border-primary/60">
            <h3 className="mb-2 text-xl font-bold">Monitoramento de servidores IPTV</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Verifique o estado do servidor, latência e comportamento de endpoints autorizados. Diferencie queda geral de instabilidade da API.</p>
            <span className="font-medium text-primary">Entenda o monitoramento IPTV →</span>
          </Link>
          <Link to="/monitoramento-dns" className="rounded-2xl border border-border/70 bg-card/50 p-6 transition-colors hover:border-primary/60">
            <h3 className="mb-2 text-xl font-bold">Monitoramento DNS</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Acompanhe resolução DNS, mudanças de IP e propagação para identificar falhas de domínio antes de confundi-las com queda de servidor.</p>
            <span className="font-medium text-primary">Verificar recursos DNS →</span>
          </Link>
          <Link to="/revendedor-stream-monitor" className="rounded-2xl border border-border/70 bg-card/50 p-6 transition-colors hover:border-primary/60">
            <h3 className="mb-2 text-xl font-bold">Sistema para revendedores IPTV</h3>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">Organize servidores, recebimento de alertas e acompanhamento de infraestrutura em um painel pensado para revendas.</p>
            <span className="font-medium text-primary">Conhecer solução para revenda →</span>
          </Link>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Precisa investigar uma falha? Leia também <Link to="/blog/como-saber-se-servidor-iptv-caiu" className="text-primary underline">como descobrir se um servidor IPTV caiu</Link>.</p>
      </section>

      <section id="recursos" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Por que usar o Stream Monitor?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Feature icon={<Zap className="h-5 w-5" />} title="✅ Monitoramento 24 horas" desc="DNS, HTTP, latência e certificado SSL conferidos sem parar, de várias regiões." />
          <Feature icon={<ShieldCheck className="h-5 w-5" />} title="✅ Inteligência de diagnóstico" desc="Sistema anti-falso positivo com burst de confirmação e análise detalhada de falhas." />
          <Feature icon={<Bell className="h-5 w-5" />} title="✅ Alertas Telegram" desc="Receba notificações no Telegram após a confirmação de falhas, com histórico para investigar incidentes." />
          <Feature icon={<Activity className="h-5 w-5" />} title="✅ Monitoramento IPTV real" desc="Monitoramento dedicado de painéis IPTV com Health Score exclusivo e verificação de fluxo." />
          <Feature icon={<Globe className="h-5 w-5" />} title="✅ Análise de conteúdo" desc="Acompanhe conteúdos recentes e status de servidores IPTV com integração TMDB." />
          <Feature icon={<LineChart className="h-5 w-5" />} title="✅ Sistema para revendedores" desc="Estrutura completa para gerenciar sub-revendas com sistema de créditos independente." />
          <Feature icon={<PlayCircle className="h-5 w-5" />} title="Monitoramento e Diagnóstico" desc="Painel para acompanhamento da disponibilidade, latência e desempenho dos serviços monitorados." />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="text-3xl font-bold text-center mb-4">Mais controle para sua operação</h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">Recursos que ajudam revendedores a acompanhar seus serviços e investigar instabilidades.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          <Stat label="Disponibilidade" value="DNS e HTTP" />
          <Stat label="Alertas" value="Telegram" />
          <Stat label="Histórico" value="Incidentes" />
          <Stat label="Diagnóstico" value="IPTV" />
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-t border-border/60" itemScope itemType="https://schema.org/FAQPage">
        <h2 className="text-3xl font-bold text-center mb-12 text-primary">Perguntas Frequentes (FAQ)</h2>
        <div className="space-y-6">
          <FaqItem question="O que é o Stream Monitor?" answer="O Stream Monitor é uma plataforma profissional de monitoramento 24h para servidores IPTV, DNS e infraestrutura, com foco em diagnóstico de falhas e alertas após a confirmação." />
          <FaqItem question="Como funciona o monitoramento IPTV?" answer="O sistema verifica a disponibilidade da API, status de fluxos e gera um Health Score exclusivo de 0 a 100%, alertando sobre qualquer instabilidade detectada." />
          <FaqItem question="Recebo alertas no Telegram?" answer="Sim! O Stream Monitor envia notificações em tempo real no Telegram, ajudando você a identificar problemas e organizar a resposta da sua operação." />
          <FaqItem question="Posso usar para revenda?" answer="Sim, oferecemos um sistema completo para revendedores gerenciarem suas próprias redes de monitoramento com autonomia e lucratividade." />
          <FaqItem question="Como contratar?" answer="Basta criar uma conta, escolher seu plano ou adquirir créditos e começar a monitorar sua infraestrutura em segundos." />
        </div>
      </section>

      <section className="relative isolate overflow-hidden border-y border-blue-500/15 bg-[#071225]">
        <div className="pointer-events-none absolute -right-36 -top-44 h-[440px] w-[440px] rounded-full bg-blue-600/20 blur-[110px]" />
        <div className="pointer-events-none absolute -bottom-48 -left-40 h-[420px] w-[420px] rounded-full bg-blue-700/20 blur-[110px]" />
        <div className="relative mx-auto max-w-5xl px-5 py-16 text-center sm:px-8 sm:py-24">
          <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-500/15 text-blue-400 shadow-lg shadow-blue-600/10">
            <Activity className="h-7 w-7" />
          </div>
          <h2 className="mx-auto max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Pronto para profissionalizar <span className="text-blue-400">sua operação?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Centralize o monitoramento, acompanhe seus servidores e tenha mais controle sobre a sua infraestrutura.
          </p>
          <div className="mx-auto mt-9 flex w-full max-w-md flex-col justify-center gap-3 sm:max-w-none sm:flex-row">
            <Link to="/auth" className="w-full sm:w-auto">
              <Button size="lg" className="h-12 w-full rounded-xl bg-blue-600 px-8 font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 sm:w-auto">
                Começar agora <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="h-12 w-full rounded-xl border-blue-300/30 bg-white/5 px-7 text-white hover:bg-white/10 hover:text-white sm:w-auto">
                <Send className="mr-2 h-4 w-4" /> Canal de Novidades
              </Button>
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#050C19] text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-14 lg:py-16">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white">
              <Activity className="h-7 w-7 text-blue-400" />
              <span className="text-xl font-extrabold tracking-tight">stream<span className="text-blue-400">monitor</span></span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-slate-400">Tecnologia para monitorar servidores, DNS e infraestrutura em uma única plataforma.</p>
          </div>
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-white">Plataforma</h3>
            <nav aria-label="Links da plataforma" className="grid gap-3 text-sm">
              <Link to="/monitoramento-iptv" className="w-fit hover:text-blue-400">Monitoramento IPTV</Link>
              <Link to="/monitoramento-dns" className="w-fit hover:text-blue-400">Monitoramento DNS</Link>
              <Link to="/alertas-telegram" className="w-fit hover:text-blue-400">Alertas</Link>
            </nav>
          </div>
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-white">Links úteis</h3>
            <nav aria-label="Links úteis" className="grid gap-3 text-sm">
              <Link to="/revendedor-stream-monitor" className="w-fit hover:text-blue-400">Seja revendedor</Link>
              <Link to="/blog" className="w-fit hover:text-blue-400">Blog</Link>
              <Link to="/auth" className="w-fit hover:text-blue-400">Entrar na plataforma</Link>
              <a href="https://t.me/+RId642Ac4AFkOWFh" target="_blank" rel="noopener noreferrer" className="w-fit hover:text-blue-400">Telegram</a>
            </nav>
          </div>
        </div>
        <div className="border-t border-white/10 px-6 py-5 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Stream Monitor. Todos os direitos reservados.
        </div>
      </footer>

      </main>
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


/** The existing 16MB presentation video is the primary conversion asset.
 * It does not autoplay/download on page load, protecting mobile performance.
 */
function PresentationVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);

  const playVideo = async () => {
    const player = videoRef.current;
    if (!player) return;
    try {
      player.muted = false;
      await player.play();
      setStarted(true);
      setPlaying(true);
      setError(false);
    } catch {
      // Some devices need muted playback before the user can enable sound.
      try {
        player.muted = true;
        await player.play();
        setMuted(true);
        setStarted(true);
        setPlaying(true);
        setError(false);
      } catch {
        setError(true);
        setPlaying(false);
      }
    }
  };

  return (
    <div className="relative min-w-0" aria-label="Vídeo de apresentação do Stream Monitor">
      <div className="pointer-events-none absolute -inset-8 rounded-full bg-blue-600/15 blur-[70px]" />
      <div className="relative overflow-hidden rounded-[1.5rem] border border-blue-400/25 bg-[#081223] shadow-2xl shadow-blue-600/15">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400"><Play className="h-4 w-4" /></span>
            Apresentação do Stream Monitor
          </div>
          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-300">ASSISTA AO VÍDEO</span>
        </div>
        <div className="relative mx-auto flex min-h-[340px] items-center justify-center bg-gradient-to-br from-[#0b1c3b] via-[#060e1c] to-[#020711] py-4 sm:min-h-[400px]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute left-[12%] top-[15%] h-36 w-36 rounded-full bg-blue-600/20 blur-[70px]" />
            <div className="absolute bottom-[10%] right-[12%] h-44 w-44 rounded-full bg-cyan-500/15 blur-[70px]" />
          </div>
          <div className="relative w-[min(64%,225px)] overflow-hidden rounded-[1.5rem] border-[5px] border-slate-700/75 bg-slate-950 shadow-[0_15px_60px_rgba(0,0,0,0.7)]" style={{ aspectRatio: "9 / 16" }}>
            <video
              ref={videoRef}
              src={heroVideoAsset.url}
              preload="none"
              playsInline
              controls={started}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() => setError(true)}
              aria-label="Demonstração em vídeo do Stream Monitor"
              className="h-full w-full object-contain"
            />
            {!started && (
              <button
                type="button"
                onClick={playVideo}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#102448] via-[#0a1630] to-[#030711] p-4 text-center text-white transition-colors hover:from-[#163360] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400"
                aria-label="Reproduzir vídeo de apresentação do Stream Monitor"
              >
                <Activity className="h-10 w-10 text-blue-400" aria-hidden="true" />
                <span className="text-base font-black tracking-tight sm:text-lg">Veja como funciona</span>
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 shadow-lg shadow-blue-600/35">
                  <Play className="ml-1 h-8 w-8 fill-white" />
                </span>
                <span className="text-xs text-slate-300">Toque para assistir com som</span>
              </button>
            )}
          </div>
          {started && !playing && !error && (
            <button type="button" onClick={playVideo} className="absolute bottom-5 left-5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xl">
              <Play className="mr-1 inline h-4 w-4" /> Continuar vídeo
            </button>
          )}
          {error && (
            <p role="alert" className="absolute bottom-3 left-3 right-3 rounded-lg border border-amber-500/30 bg-black/80 p-2 text-center text-xs text-amber-200">
              Não foi possível reproduzir o vídeo agora. Você pode conhecer os planos abaixo.
            </p>
          )}
        </div>
        <div className="space-y-3 border-t border-white/10 bg-[#0a1426] p-4 sm:p-5">
          <p className="text-center text-sm font-medium text-slate-200">Conheça a plataforma antes de escolher seu plano.</p>
          <Link to="/auth" className="block">
            <Button className="h-12 w-full rounded-xl bg-blue-600 text-base font-bold text-white hover:bg-blue-500">
              Criar minha conta e assinar <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-center text-xs text-slate-400">Cadastro simples · Planos disponíveis dentro do painel</p>
        </div>
      </div>
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
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-4 leading-relaxed">
            Nossa inteligência encontra filmes e séries disponíveis nos seus servidores.
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

