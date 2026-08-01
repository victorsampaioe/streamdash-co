import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusDot, StatusLabel } from "@/components/status-dot";
import { Copy, Check, MessageCircle, Send, Zap, ShieldCheck, Activity, Film, Tv, Radio } from "lucide-react";
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
      { title: `${params.slug} — Servidores, DNS e Novidades` },
      { name: "description", content: "Página oficial com status dos servidores, DNS atualizada e novidades de filmes, séries e canais." },
      { property: "og:title", content: `${params.slug} — Servidores, DNS e Novidades` },
      { property: "og:description", content: "Status em tempo real, DNS oficial e novidades adicionadas recentemente." },
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
      className="gap-2"
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
    refetchInterval: 60000,
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
  const dnsList = servers.filter((s) => s.dns);
  const allUp = servers.length > 0 && servers.every((s) => s.status === "up");
  const avgLatency = servers.filter((s) => s.latency_ms != null).reduce((a, s, _i, arr) => a + (s.latency_ms ?? 0) / arr.length, 0);
  const today = new Date();
  const todayNews = news.filter((n) => new Date(n.detected_at).toDateString() === today.toDateString());
  const byKind = (k: string) => news.filter((n) => n.kind === k);

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ ["--brand" as any]: p.primary_color, ["--brand2" as any]: p.accent_color }}>
      <div
        className="px-6 py-12 text-center border-b border-border/60"
        style={{ background: `linear-gradient(135deg, ${p.primary_color}22, ${p.accent_color}22)` }}
      >
        {p.logo_url ? (
          <img src={p.logo_url} alt={`Logo ${p.display_name}`} className="h-16 w-16 rounded-2xl object-cover mx-auto mb-4 border border-border/60" />
        ) : (
          <div
            className="h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${p.primary_color}, ${p.accent_color})` }}
          >
            {p.display_name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{p.display_name}</h1>
        <p className="mt-2 text-base sm:text-lg font-medium" style={{ color: p.primary_color }}>{p.tagline}</p>
        {p.intro && <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">{p.intro}</p>}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {p.whatsapp && (
            <Button asChild className="gap-2" style={{ background: p.primary_color }}>
              <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          {p.telegram && (
            <Button asChild variant="secondary" className="gap-2">
              <a href={`https://t.me/${p.telegram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">
                <Send className="h-4 w-4" /> Telegram
              </a>
            </Button>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Card className={`p-5 border ${allUp ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" style={{ color: p.primary_color }} />
              {allUp ? "🟢 Servidor funcionando normalmente" : "🟡 Monitorando instabilidades"}
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: p.accent_color }} />
              ⚡ {avgLatency ? `${Math.round(avgLatency)}ms de latência média` : "Baixa latência"}
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" /> ✅ Alta estabilidade
            </div>
          </div>
        </Card>

        {p.show_servers && servers.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">📡 Servidores</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {servers.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={s.status} />
                      <span className="font-medium truncate">{s.name}</span>
                    </div>
                    <StatusLabel status={s.status} />
                  </div>
                  {s.health != null && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Saúde</span>
                        <span className="font-mono">{s.health}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${s.health}%`, background: p.primary_color }} />
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Última atualização: {s.last_checked_at ? new Date(s.last_checked_at).toLocaleString("pt-BR") : "—"}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {p.show_novidades && news.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Novidades</h2>
              <CopyButton
                color={p.primary_color}
                label="Copiar novidades"
                text={news.map((n) => `• ${n.name}`).join("\n")}
              />
            </div>
            {todayNews.length > 0 && (
              <Card className="p-4 mb-3 border" style={{ borderColor: p.accent_color }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold mb-1">🔥 Novidades de hoje</div>
                    <p className="text-sm text-muted-foreground">{todayNews.length} novos títulos/canais adicionados hoje.</p>
                  </div>
                  <CopyButton
                    color={p.accent_color}
                    label="Copiar de hoje"
                    text={todayNews.map((n) => `• ${n.name}`).join("\n")}
                  />
                </div>
              </Card>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { key: "vod", label: "🎬 Filmes adicionados", icon: Film },
                { key: "series", label: "📺 Séries novas", icon: Tv },
                { key: "live", label: "📡 Canais atualizados", icon: Radio },
              ].map(({ key, label }) => {
                const items = byKind(key);
                return (
                  <Card key={key} className="p-4">
                    <div className="text-sm font-medium mb-2">{label}</div>
                    <div className="text-2xl font-bold mb-2" style={{ color: p.primary_color }}>{items.length}</div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {items.slice(0, 6).map((n, i) => (
                        <li key={i} className="truncate">• {n.name}</li>
                      ))}
                      {items.length === 0 && <li>Sem novidades nos últimos 7 dias.</li>}
                    </ul>
                    {items.length > 0 && (
                      <div className="mt-3">
                        <CopyButton
                          color={p.primary_color}
                          label="Copiar lista"
                          text={items.map((n) => `• ${n.name}`).join("\n")}
                        />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}

            </div>
          </section>
        )}
      </main>

      <footer className="px-6 py-8 text-center text-xs text-muted-foreground">
        Monitorado 24/7 por <a href="/" className="text-primary hover:underline">streammonitor.site</a>
      </footer>
    </div>
  );
}
