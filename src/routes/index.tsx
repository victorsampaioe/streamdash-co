import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState, useRef } from "react";
import { Activity, ArrowRight, ServerIcon, Bell, Globe, Zap, ShieldCheck, LineChart, Send, BookOpen, UserCheck, TrendingUp, Search, Film, Tv, CheckCircle2, Cpu, PlayCircle, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

import heroVideoAsset from "@/assets/hero-video.mp4.asset.json";
import { telegramAlertExample, maintenanceNoticeExample } from "@/assets/alert-examples";
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
      <header className="sm-public-header border-b border-blue-400/10 backdrop-blur-xl bg-background/90 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 gap-3">
          <div className="sm-public-brand flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-500/10"><Activity className="h-5 w-5 text-blue-400" aria-hidden="true" /></span>
            <span className="font-extrabold tracking-tight text-[17px] sm:text-xl">stream<span className="text-blue-400">monitor</span></span>
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
            <Link to="/auth"><Button variant="ghost" size="sm" className="sm-public-login">Entrar</Button></Link>
            <Link to="/auth" search={{tab:"signup"}}><Button size="sm" className="sm-public-start rounded-xl bg-blue-500 px-4 font-semibold text-white hover:bg-blue-400">Cadastrar <ArrowRight className="hidden h-3.5 w-3.5 sm:inline" /></Button></Link>
          </div>

        </div>
      </header>

      <section className="sm-hero sm-landing-hero relative isolate overflow-hidden border-b border-blue-400/10">
        <div aria-hidden="true" className="sm-hero-grid pointer-events-none absolute inset-0" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-28 h-[500px] w-[500px] rounded-full bg-blue-500/15 blur-[110px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-9 px-4 pb-14 pt-12 sm:gap-12 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:py-24">
          <div className="sm-hero-copy min-w-0">
            <div className="sm-hero-badge mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[.12em] text-blue-300 sm:text-xs">
              <Activity className="h-4 w-4 shrink-0" /> <span>Inteligência para sua operação</span>
            </div>
            <h1 className="sm-hero-heading max-w-[730px] text-[clamp(2.65rem,7.8vw,5rem)] font-black leading-[1.045] tracking-[-.065em] text-foreground">
              Seu servidor caiu?
              <span className="mt-2 block bg-gradient-to-r from-blue-400 via-blue-500 to-cyan-300 bg-clip-text text-transparent">Descubra antes que seus clientes reclamem.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Monitore DNS, disponibilidade e latência dos seus servidores. Receba alertas no Telegram quando uma falha for confirmada — tudo em um painel criado para revendedores, por R$ 25/mês.
            </p>
            <div className="sm-hero-actions mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link to="/auth" search={{tab:"signup"}} className="block">
                <Button size="lg" className="sm-primary-cta h-13 w-full rounded-xl bg-blue-600 px-7 text-sm font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 sm:w-auto sm:text-base">
                  Criar minha conta <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/revendedor-stream-monitor" className="block">
                <Button variant="outline" size="lg" className="h-13 w-full rounded-xl border-blue-300/20 bg-white/[.035] px-6 text-sm font-semibold hover:bg-blue-500/10 sm:w-auto sm:text-base">
                  Soluções para revendedores
                </Button>
              </Link>
            </div>
            <div className="sm-hero-capabilities mt-8 grid grid-cols-3 gap-2 border-t border-blue-400/15 pt-6 sm:gap-4">
              {[
                { icon: <Globe className="h-4 w-4" />, label: "DNS", detail: "Disponibilidade" },
                { icon: <Zap className="h-4 w-4" />, label: "HTTP", detail: "Latência" },
                { icon: <Activity className="h-4 w-4" />, label: "IPTV", detail: "Diagnóstico" },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-xl border border-blue-400/10 bg-blue-500/[.035] p-3 sm:p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-blue-400">{item.icon}<span className="text-sm font-bold text-foreground">{item.label}</span></div>
                  <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="sm-hero-preview min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.13em] text-blue-300"><span className="h-2 w-2 rounded-full bg-blue-400" /> Conheça a plataforma</span>
              <span className="text-[11px] text-muted-foreground">Vídeo demonstrativo</span>
            </div>
            <PresentationVideo />
          </div>
        </div>
      </section>


      {/* Real-world timing example supplied by a user. DNS status and platform
          availability remain separate signals; never equate DNS failure with
          an independently verified service outage. */}
      <section id="alerta-antecipado" aria-labelledby="alerta-antecipado-title" className="relative overflow-hidden border-b border-blue-400/20 bg-[#061326] py-16 text-white sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute -right-28 top-24 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl"/>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/35 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[.13em] text-blue-200">
              <Bell size={15}/> Veja o alerta antes de receber o comunicado
            </span>
            <h2 id="alerta-antecipado-title" className="mt-5 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              O problema aconteceu. <span className="text-blue-400">Você já sabia.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-lg">
              Em um exemplo real compartilhado com a gente, o Stream Monitor identificou uma falha de resolução DNS e enviou o alerta no Telegram às <strong className="text-white">06:02:07</strong>. O comunicado do serviço sobre manutenção apareceu às <strong className="text-white">08:38</strong>.
            </p>
          </div>

          <div className="mx-auto my-9 flex max-w-4xl flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
            <div className="w-full rounded-2xl border border-blue-400/40 bg-blue-500/10 p-5 text-center sm:w-[38%]">
              <p className="text-[11px] font-extrabold uppercase tracking-[.13em] text-blue-200">Alerta Stream Monitor</p>
              <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-white sm:text-5xl">06:02<span className="ml-1 text-xl text-blue-200">:07</span></p>
              <p className="mt-2 text-xs text-slate-300">12 de novembro de 2026 · Telegram</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1 text-center">
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-cyan-200">cerca de 2h36 de diferença</span>
              <span className="hidden h-px w-10 bg-blue-400/50 sm:block"/>
              <ArrowRight className="h-5 w-5 rotate-90 text-blue-400 sm:rotate-0"/>
            </div>
            <div className="w-full rounded-2xl border border-slate-600/50 bg-slate-800/30 p-5 text-center sm:w-[38%]">
              <p className="text-[11px] font-extrabold uppercase tracking-[.13em] text-slate-300">Comunicado posterior do serviço</p>
              <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-white sm:text-5xl">08:38</p>
              <p className="mt-2 text-xs text-slate-300">Mensagem de manutenção no WhatsApp</p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-3xl border border-blue-400/30 bg-[#0a1b34] p-4 shadow-2xl shadow-blue-950/30 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-widest text-blue-300">01 · Aviso antecipado</p><h3 className="mt-1 text-lg font-extrabold sm:text-xl">Telegram · Stream Monitor</h3></div>
                <span className="shrink-0 rounded-lg border border-blue-400/40 bg-blue-400/10 px-3 py-1.5 text-sm font-extrabold tabular-nums text-blue-200">06:02:07</span>
              </div>
              {telegramAlertExample ? <img src={telegramAlertExample} alt="Captura real do alerta Stream Monitor no Telegram às 06:02:07 em 12/11/2026, apontando falha de resolução DNS confirmada em resolvedores diferentes" className="mx-auto max-h-[600px] w-auto max-w-full rounded-2xl border border-white/10 object-contain" loading="lazy"/> :
                <div className="rounded-2xl border border-blue-400/20 bg-[#0b1426] p-6 text-sm leading-7 text-slate-100"><strong>🚨 STREAM MONITOR — DNS OFFLINE CONFIRMADO</strong><p className="mt-3">Status DNS: 🔴 Não resolve</p><p>Confirmação: falhas consecutivas em resolvedores independentes</p><p>Horário: 06:02:07 (12/11/2026)</p></div>}
              <p className="mt-4 text-xs leading-5 text-slate-300">Exemplo de aviso enviado automaticamente com diagnóstico de DNS. O monitoramento DNS, por si só, não determina a disponibilidade do vídeo.</p>
            </article>
            <article className="rounded-3xl border border-slate-500/30 bg-[#0a1b34] p-4 shadow-2xl shadow-blue-950/30 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-widest text-slate-300">02 · Aviso posterior</p><h3 className="mt-1 text-lg font-extrabold sm:text-xl">Comunicado do serviço</h3></div>
                <span className="shrink-0 rounded-lg border border-slate-400/40 bg-slate-400/10 px-3 py-1.5 text-sm font-extrabold tabular-nums text-slate-100">08:38</span>
              </div>
              {maintenanceNoticeExample ? <img src={maintenanceNoticeExample} alt="Captura de comunicado de manutenção do serviço no WhatsApp publicado às 08:38" className="mx-auto w-full max-w-[520px] rounded-2xl border border-white/10 object-contain" loading="lazy"/> :
                <div className="rounded-2xl bg-white p-6 text-sm leading-7 text-slate-900"><strong>Olá, bom dia!</strong><p className="mt-3">Informamos que estamos realizando manutenção em nosso sistema.</p><p>Em breve, o sistema estará novamente disponível.</p><p className="mt-3 text-right font-semibold text-slate-600">08:38</p></div>}
              <p className="mt-4 text-xs leading-5 text-slate-300">Mensagem posterior comunicando uma manutenção. As duas capturas mostram os horários informados neste caso, não um tempo garantido de antecipação para todas as ocorrências.</p>
            </article>
          </div>
          <div className="mt-8 rounded-2xl border border-blue-400/20 bg-blue-400/[.05] p-5 text-center">
            <p className="font-bold text-white">Receba alertas e se antecipe aos chamados dos clientes.</p>
            <p className="mt-2 text-sm text-slate-300">Monitore DNS, HTTP, SSL e disponibilidade. Alertas são enviados após confirmação e dependem das condições e integrações de monitoramento.</p>
          </div>
        </div>
      </section>

      <section id="precos" aria-labelledby="plano-mensal-title" className="relative overflow-hidden border-b border-blue-500/15 bg-gradient-to-br from-[#091930] via-[#0b2042] to-[#081120] py-16 text-white sm:py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-cyan-200">Plano mensal Stream Monitor</span>
            <h2 id="plano-mensal-title" className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">Monitoramento profissional sem complicar seu orçamento.</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">Controle seus servidores e receba alertas de queda e recuperação em um único painel. Descubra falhas antes que a situação vire uma enxurrada de mensagens no suporte.</p>
            <div className="mt-6 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
              {["Monitoramento DNS e disponibilidade","Alertas automáticos no Telegram","Histórico de incidentes e diagnósticos","Painel leve para revendedores"].map(item=>
                <p key={item} className="flex items-center gap-2"><CheckCircle2 size={17} className="shrink-0 text-cyan-400"/>{item}</p>
              )}
            </div>
          </div>
          <div className="rounded-[28px] border border-blue-400/40 bg-[#061225] p-6 shadow-[0_22px_65px_rgba(25,90,220,.26)] sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-200">Acesso à plataforma · mensal</p>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-xl font-semibold text-white">R$</span>
              <span className="text-6xl font-black tabular-nums tracking-tight text-white sm:text-7xl">25</span>
              <span className="mb-2 text-2xl font-bold text-white">,00</span>
              <span className="mb-2 text-sm font-semibold text-slate-300">/mês</span>
            </div>
            <p className="mt-3 text-sm text-slate-300">Plano mensal de 30 dias. Contratação e pagamento pelo painel da conta.</p>
            <Link to="/auth" search={{tab:"signup"}} className="mt-7 block">
              <Button size="lg" className="min-h-14 w-full rounded-2xl bg-blue-500 px-4 text-sm font-extrabold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-400 sm:text-lg">
                Cadastre-se agora por R$ 25/mês <ArrowRight size={20} className="ml-2"/>
              </Button>
            </Link>
            <p className="mt-3 text-center text-xs leading-5 text-slate-400">Crie sua conta gratuitamente e escolha o plano mensal dentro do painel. Não é um teste gratuito automático.</p>
          </div>
        </div>
      </section>

      <section id="novidades-vitrines" aria-labelledby="titulo-novas-vitrines" className="relative overflow-hidden border-y border-blue-400/20 bg-gradient-to-b from-[#07172d] via-[#0a1935] to-background py-14 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -top-36 right-0 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-9 max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-cyan-300">
              <Zap size={14} /> Nova atualização disponível
            </span>
            <h2 id="titulo-novas-vitrines" className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
              Sua divulgação agora tem outra cara.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300 sm:text-base">
              Conheça a <strong className="text-white">Vitrine IA</strong> e a <strong className="text-white">Vitrine Banner</strong>: duas formas de criar artes profissionais de filmes e séries com a identidade da sua revenda.
            </p>
          </div>

          <div className="grid items-stretch gap-5 lg:grid-cols-2">
            <article className="group overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#071126]/95 shadow-[0_18px_70px_rgba(0,0,0,.3)]">
              <div className="relative overflow-hidden bg-[#051022] p-3 sm:p-5">
                <img src="/api/public/vitrine-exemplos/como-magica" alt="Exemplo real de Vitrine IA com arte cinematográfica de Como Mágica, capa e descrição da obra" width={1080} height={1080} loading="lazy" className="mx-auto aspect-square w-full max-w-[440px] rounded-2xl object-contain shadow-2xl transition-transform duration-500 group-hover:scale-[1.015]" />
                <span className="absolute left-6 top-6 rounded-full border border-cyan-300/35 bg-[#07172f]/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-200">Criado com IA</span>
              </div>
              <div className="space-y-4 p-6 sm:p-7">
                <div className="flex items-center gap-3 text-cyan-300"><Cpu size={24} /><h3 className="text-2xl font-black text-white">Vitrine IA</h3></div>
                <p className="text-sm leading-relaxed text-slate-300">A inteligência artificial cria o cenário da arte conforme o filme ou série escolhido. Personalize com sua marca e produza uma divulgação única.</p>
                <p className="text-sm font-semibold text-cyan-200">5 créditos de geração por dia para cada revendedor.</p>
                <Link to="/vitrine-ai" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-400">
                  Acessar Vitrine IA <ArrowRight size={17} />
                </Link>
              </div>
            </article>

            <article className="group overflow-hidden rounded-3xl border border-blue-400/25 bg-[#071126]/95 shadow-[0_18px_70px_rgba(0,0,0,.3)]">
              <div className="relative overflow-hidden bg-[#051022] p-3 sm:p-5">
                <img src="/api/public/vitrine-exemplos/codigo-vinganca" alt="Exemplo real de Vitrine Banner com a capa de Código: Vingança, título, sinopse e identidade visual da revenda" width={1080} height={1080} loading="lazy" className="mx-auto aspect-square w-full max-w-[440px] rounded-2xl object-contain shadow-2xl transition-transform duration-500 group-hover:scale-[1.015]" />
                <span className="absolute left-6 top-6 rounded-full border border-blue-300/35 bg-[#07172f]/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-200">Criações ilimitadas</span>
              </div>
              <div className="space-y-4 p-6 sm:p-7">
                <div className="flex items-center gap-3 text-blue-300"><Film size={24} /><h3 className="text-2xl font-black text-white">Vitrine Banner</h3></div>
                <p className="text-sm leading-relaxed text-slate-300">Escolha o filme ou série e gere seu banner com capa, informações da obra, sua logo e WhatsApp. Simples, rápido e profissional.</p>
                <p className="text-sm font-semibold text-cyan-200">Quantas artes quiser, sem consumir créditos de IA.</p>
                <Link to="/vitrine-banner" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-300/40 bg-blue-500/15 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500/30">
                  Acessar Vitrine Banner <ArrowRight size={17} />
                </Link>
              </div>
            </article>
          </div>

          <p className="mt-9 text-center text-sm font-bold tracking-wide text-blue-200">STREAM MONITOR — SEMPRE INOVANDO.</p>
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
          <FaqItem question="Quanto custa o plano mensal?" answer="O plano mensal de acesso ao Stream Monitor custa R$ 25 por 30 dias. Cadastre-se e contrate no painel; planos e créditos de revenda podem ter preços diferentes." />
          <FaqItem question="Como contratar?" answer="Crie sua conta gratuitamente, acesse Minha Assinatura e escolha o plano mensal de R$ 25 ou outra opção disponível no painel." />
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
            <Link to="/auth" search={{tab:"signup"}} className="w-full sm:w-auto">
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
              <Link to="/privacidade" className="w-fit hover:text-blue-400">Privacidade e anúncios</Link>
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
      <div className="sm-preview-window relative overflow-hidden rounded-[1.35rem] border border-blue-400/25 bg-[#081223] shadow-2xl shadow-blue-600/10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400"><Play className="h-4 w-4" /></span>
            Stream Monitor em ação
          </div>
          <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-blue-300">ASSISTA AO VÍDEO</span>
        </div>
        <div className="relative mx-auto flex min-h-[255px] items-center justify-center bg-gradient-to-br from-[#0b1c3b] via-[#060e1c] to-[#020711] py-5 sm:min-h-[360px]">
          <div className="pointer-events-none absolute inset-0 opacity-70">
            <div className="absolute left-[12%] top-[15%] h-36 w-36 rounded-full bg-blue-600/20 blur-[70px]" />
            <div className="absolute bottom-[10%] right-[12%] h-44 w-44 rounded-full bg-cyan-500/15 blur-[70px]" />
          </div>
          <div className="relative w-[min(46%,176px)] sm:w-[min(50%,215px)] overflow-hidden rounded-[1.5rem] border-[5px] border-slate-700/75 bg-slate-950 shadow-[0_15px_60px_rgba(0,0,0,0.7)]" style={{ aspectRatio: "9 / 16" }}>
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
          <Link to="/auth" search={{tab:"signup"}} className="block">
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
          <Link to="/auth" search={{tab:"signup"}}>
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

