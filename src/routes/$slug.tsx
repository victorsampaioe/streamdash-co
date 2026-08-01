import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { Copy, Check, MessageCircle, Send, Zap, ShieldCheck, Activity, Film, Tv, Radio, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PageData = {
  page: {
    slug: string;
    display_name: string;
    tagline: string;
    intro: string | null;
    logo_url: string | null;
    primary_color: string;
    accent_color: string;
    whatsapp: string | null;
    telegram: string | null;
    show_servers: boolean;
    show_dns: boolean;
    show_novidades: boolean;
  };
  servers: Array<{
    id: string;
    name: string;
    status: string;
    health: number | null;
    latency_ms: number | null;
    last_checked_at: string | null;
    dns: string | null;
  }>;
  news: Array<{ kind: string; name: string; category: string | null; detected_at: string }>;
};

export const Route = createFileRoute("/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Servidores, Status e Novidades` },
      { name: "description", content: "Página oficial com status dos servidores em tempo real e novidades de filmes, séries e canais." },
      { property: "og:title", content: `${params.slug} — Servidores, Status e Novidades` },
      { property: "og:description", content: "Status em tempo real e novidades adicionadas recentemente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResellerPublicPage,
});

function CopyButton({ text, color, label = "Copiar" }: { text: string; color: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      className="gap-2 rounded-full"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("Copiado!");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Não foi possível copiar");
        }
      }}
      style={{ borderColor: color }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copiado" : label}
    </Button>
  );
}

function ResellerPublicPage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["reseller-page", slug],
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_reseller_page", { _slug: slug });
      return (data as PageData | null) ?? null;
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });


  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <Card className="p-10 text-center max-w-md">
          <h1 className="text-xl font-bold mb-2">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">Este endereço não existe ou foi desativado pelo revendedor.</p>
          <a href="/" className="text-primary text-sm hover:underline mt-4 inline-block">streammonitor.site</a>
        </Card>
      </div>
    );
  }

  const p = data.page;
  const servers = data.servers ?? [];
  const news = data.news ?? [];

  const allUp = servers.length > 0 && servers.every((s) => s.status === "up");
  const onlineCount = servers.filter((s) => s.status === "up").length;
  const latencies = servers.filter((s) => s.latency_ms != null).map((s) => s.latency_ms as number);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const healths = servers.filter((s) => s.health != null).map((s) => s.health as number);
  const avgHealth = healths.length ? Math.round(healths.reduce((a, b) => a + b, 0) / healths.length) : null;
  const today = new Date();
  const todayNews = news.filter((n) => new Date(n.detected_at).toDateString() === today.toDateString());
  const byKind = (k: string) => news.filter((n) => n.kind === k);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border/50">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: `radial-gradient(1200px 400px at 50% -10%, ${p.primary_color}33, transparent 70%), radial-gradient(800px 320px at 15% 110%, ${p.accent_color}2b, transparent 70%)` }}
        />
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.primary_color}, transparent)` }} />
        <div className="relative px-6 py-16 text-center max-w-3xl mx-auto">
          {p.logo_url ? (
            <img
              src={p.logo_url}
              alt={`Logo ${p.display_name}`}
              className="h-20 w-20 rounded-3xl object-cover mx-auto mb-5 ring-1 ring-border/60 shadow-2xl"
            />
          ) : (
            <div
              className="h-20 w-20 rounded-3xl mx-auto mb-5 flex items-center justify-center text-3xl font-black text-white shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${p.primary_color}, ${p.accent_color})` }}
            >
              {p.display_name.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur mb-4"
            style={{ borderColor: `${p.primary_color}55`, color: p.primary_color, background: `${p.primary_color}12` }}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ background: p.primary_color }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: p.primary_color }} />
            </span>
            {allUp ? "Todos os sistemas operando" : "Monitoramento ativo 24/7"}
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">{p.display_name}</h1>
          <p
            className="mt-3 text-lg sm:text-xl font-semibold bg-clip-text text-transparent"
            style={{ backgroundImage: `linear-gradient(90deg, ${p.primary_color}, ${p.accent_color})` }}
          >
            {p.tagline}
          </p>
          {p.intro && <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">{p.intro}</p>}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {p.whatsapp && (
              <Button asChild size="lg" className="gap-2 rounded-full text-white shadow-lg hover:opacity-90" style={{ background: `linear-gradient(135deg, ${p.primary_color}, ${p.accent_color})` }}>
                <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
                </a>
              </Button>
            )}
            {p.telegram && (
              <Button asChild size="lg" variant="outline" className="gap-2 rounded-full backdrop-blur">
                <a href={`https://t.me/${p.telegram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
                  <Send className="h-4 w-4" /> Telegram
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Activity, label: "Servidores online", value: `${onlineCount}/${servers.length || 0}`, color: p.primary_color },
            { icon: Zap, label: "Latência média", value: avgLatency ? `${avgLatency}ms` : "Baixa", color: p.accent_color },
            { icon: ShieldCheck, label: "Saúde geral", value: avgHealth != null ? `${avgHealth}%` : "Alta", color: p.primary_color },
            { icon: Sparkles, label: "Novidades 7 dias", value: `${news.length}`, color: p.accent_color },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="relative overflow-hidden p-4 border-border/60 bg-card/60 backdrop-blur">
              <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
              <Icon className="h-4 w-4 mb-2" style={{ color }} />
              <div className="text-2xl font-bold tracking-tight">{value}</div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
            </Card>
          ))}
        </section>

        {/* Servidores */}
        {p.show_servers && servers.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold tracking-tight">📡 Servidores</h2>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {servers.map((s) => (
                <Card key={s.id} className="group relative overflow-hidden p-5 border-border/60 bg-card/60 backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-xl">
                  <div
                    className="absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl opacity-30 transition-opacity group-hover:opacity-60"
                    style={{ background: s.status === "up" ? p.primary_color : p.accent_color }}
                  />
                  <div className="relative flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={s.status} />
                      <span className="font-semibold truncate">{s.name}</span>
                    </div>
                    <StatusLabel status={s.status} />
                  </div>
                  {s.health != null && (
                    <div className="relative mb-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Saúde</span>
                        <span className="font-mono font-semibold text-foreground">{s.health}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${s.health}%`, background: `linear-gradient(90deg, ${p.primary_color}, ${p.accent_color})` }}
                        />
                      </div>
                    </div>
                  )}
                  <p className="relative text-[11px] text-muted-foreground">
                    Atualizado: {s.last_checked_at ? new Date(s.last_checked_at).toLocaleString("pt-BR") : "—"}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Novidades */}
        {p.show_novidades && news.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-bold tracking-tight">✨ Novidades</h2>
              <div className="h-px flex-1 bg-border/60" />
              <CopyButton color={p.primary_color} label="Copiar tudo" text={news.map((n) => `• ${n.name}`).join("\n")} />
            </div>

            {todayNews.length > 0 && (
              <Card
                className="relative overflow-hidden p-5 mb-4 border"
                style={{ borderColor: `${p.accent_color}66`, background: `linear-gradient(135deg, ${p.primary_color}14, ${p.accent_color}14)` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-base mb-1">🔥 Novidades de hoje</div>
                    <p className="text-sm text-muted-foreground">{todayNews.length} novos títulos e canais adicionados hoje.</p>
                  </div>
                  <CopyButton color={p.accent_color} label="Copiar de hoje" text={todayNews.map((n) => `• ${n.name}`).join("\n")} />
                </div>
              </Card>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { key: "vod", label: "Filmes adicionados", icon: Film },
                { key: "series", label: "Séries novas", icon: Tv },
                { key: "live", label: "Canais atualizados", icon: Radio },
              ].map(({ key, label, icon: Icon }) => {
                const items = byKind(key);
                return (
                  <Card key={key} className="p-5 border-border/60 bg-card/60 backdrop-blur flex flex-col">
                    <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                      <Icon className="h-4 w-4" style={{ color: p.accent_color }} /> {label}
                    </div>
                    <div className="text-3xl font-black mb-3" style={{ color: p.primary_color }}>{items.length}</div>
                    <ul className="space-y-1 text-xs text-muted-foreground flex-1">
                      {items.slice(0, 6).map((n, i) => (
                        <li key={i} className="truncate">• {n.name}</li>
                      ))}
                      {items.length === 0 && <li>Sem novidades nos últimos 7 dias.</li>}
                    </ul>
                    {items.length > 0 && (
                      <div className="mt-4">
                        <CopyButton color={p.primary_color} label="Copiar lista" text={items.map((n) => `• ${n.name}`).join("\n")} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* CTA */}
        {(p.whatsapp || p.telegram) && (
          <section>
            <Card
              className="relative overflow-hidden p-8 text-center border-border/60"
              style={{ background: `linear-gradient(135deg, ${p.primary_color}18, ${p.accent_color}18)` }}
            >
              <h2 className="text-xl font-bold tracking-tight">Pronto para começar?</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Fale agora com o suporte e garanta seu acesso com estabilidade monitorada 24 horas por dia.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {p.whatsapp && (
                  <Button asChild size="lg" className="gap-2 rounded-full text-white" style={{ background: `linear-gradient(135deg, ${p.primary_color}, ${p.accent_color})` }}>
                    <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4" /> Chamar no WhatsApp
                    </a>
                  </Button>
                )}
                {p.telegram && (
                  <Button asChild size="lg" variant="outline" className="gap-2 rounded-full">
                    <a href={`https://t.me/${p.telegram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
                      <Send className="h-4 w-4" /> Telegram
                    </a>
                  </Button>
                )}
              </div>
            </Card>
          </section>
        )}
      </main>

      <footer className="px-6 py-10 text-center text-xs text-muted-foreground border-t border-border/50">
        Monitorado 24/7 por <a href="/" className="text-primary hover:underline font-medium">streammonitor.site</a>
      </footer>
    </div>
  );
}
