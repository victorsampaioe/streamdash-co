import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import {
  Rocket, ServerIcon, ShieldCheck, Gauge, Globe, Zap, Tv, Trophy, Bell, Send,
  HelpCircle, Check, BookOpen, type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/ajuda")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda — Stream Monitor" },
      { name: "description", content: "Guia completo do Stream Monitor: servidores, Xtream, IPTV Health Score, DNS Intelligence, alertas e Telegram." },
      { property: "og:title", content: "Central de Ajuda — Stream Monitor" },
      { property: "og:description", content: "Aprenda a usar cada função do painel Stream Monitor em linguagem simples." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpCenterPage,
});

type Item = {
  id: string;
  title: string;
  icon: LucideIcon;
  body: string;
  bullets?: { label: string; text: string; tone?: "ok" | "warn" | "bad" }[];
};

type Category = { id: string; label: string; icon: LucideIcon; items: Item[] };

const CATEGORIES: Category[] = [
  {
    id: "start", label: "Primeiros passos", icon: Rocket,
    items: [
      {
        id: "como-funciona", title: "Como funciona o Stream Monitor?", icon: Rocket,
        body: "O Stream Monitor testa seus servidores e DNS de forma automática, 24 horas por dia. A cada ciclo ele acessa o host, mede o tempo de resposta, confere o certificado, valida o painel IPTV e guarda o resultado no histórico.",
        bullets: [
          { label: "O que monitoramos", text: "DNS/host, portas, latência, SSL, login Xtream, Player API, canais, filmes e séries." },
          { label: "Com que frequência", text: "Checagens periódicas automáticas, além de testes regionais (SP, EUA, Europa, Ásia)." },
        ],
      },
      {
        id: "cadastrar", title: "Como cadastrar um servidor", icon: ServerIcon,
        body: "Clique em \"Novo servidor\" no topo do painel, dê um nome fácil de lembrar, informe o host (domínio ou IP) e, se for IPTV, o usuário e a senha do painel. Pronto: o sistema já começa a testar.",
        bullets: [
          { label: "Dica", text: "Use nomes claros (ex.: \"Servidor Principal\") — é esse nome que aparece nos alertas e no ranking." },
        ],
      },
      {
        id: "interpretar", title: "Como interpretar os resultados", icon: Gauge,
        body: "No card de cada servidor você vê o status atual, a latência média, o uptime do período e a nota de saúde. Quanto mais verde e menor a latência, melhor.",
        bullets: [
          { label: "Uptime", text: "Percentual de tempo em que o servidor respondeu corretamente." },
          { label: "Histórico", text: "Os gráficos mostram quedas e picos de lentidão ao longo do tempo." },
        ],
      },
    ],
  },
  {
    id: "servers", label: "Servidores", icon: ServerIcon,
    items: [
      {
        id: "campos", title: "O que significa cada campo", icon: ServerIcon,
        body: "No cadastro cada campo tem um papel específico:",
        bullets: [
          { label: "Nome", text: "Identificação interna. Só você vê." },
          { label: "Host / IP", text: "O endereço do servidor, como dns.seuservidor.com ou 187.10.0.1." },
          { label: "Porta", text: "Porta usada para o teste (padrão 80/443). Em painéis IPTV costuma ser a porta do Xtream." },
          { label: "Usuário e senha", text: "Credenciais do painel IPTV, usadas apenas para validar o login. Ficam criptografadas." },
        ],
      },
      {
        id: "status", title: "Status do servidor", icon: ShieldCheck,
        body: "O sistema resume o estado atual em três cores:",
        bullets: [
          { label: "🟢 Online", text: "Servidor respondendo normalmente.", tone: "ok" },
          { label: "🟡 Atenção", text: "Servidor com lentidão ou instabilidade intermitente.", tone: "warn" },
          { label: "🔴 Offline", text: "Servidor não respondeu aos testes.", tone: "bad" },
        ],
      },
    ],
  },
  {
    id: "xtream", label: "Validação Xtream", icon: ShieldCheck,
    items: [
      {
        id: "xtream-ok", title: "Login Xtream e Player API", icon: ShieldCheck,
        body: "Quando aparece \"Login Xtream válido\", o sistema conseguiu autenticar com o usuário e a senha informados. \"Player API funcionando\" significa que conseguimos ler as informações do painel (canais, filmes, séries, validade).",
      },
      {
        id: "xtream-erros", title: "Erros comuns", icon: HelpCircle,
        body: "Se a validação falhar, o motivo costuma ser um destes:",
        bullets: [
          { label: "Usuário inválido", text: "A conta não existe ou expirou no painel.", tone: "bad" },
          { label: "Senha incorreta", text: "Confira maiúsculas/minúsculas e espaços.", tone: "bad" },
          { label: "API bloqueada", text: "O painel bloqueou consultas externas ou o IP do teste.", tone: "warn" },
          { label: "Servidor offline", text: "O host não respondeu — o problema não é a credencial.", tone: "bad" },
        ],
      },
    ],
  },
  {
    id: "score", label: "IPTV Health Score", icon: Gauge,
    items: [
      {
        id: "score-o-que", title: "O que é o Health Score", icon: Gauge,
        body: "O IPTV Health Score é uma nota de 0 a 100 que mostra a qualidade geral do servidor, juntando vários testes em um único número.",
        bullets: [
          { label: "Fatores", text: "Uptime, latência, velocidade de resposta, estabilidade e disponibilidade dos serviços." },
          { label: "🟢 90–100", text: "Excelente.", tone: "ok" },
          { label: "🟡 70–89", text: "Bom, mas com pontos a melhorar.", tone: "warn" },
          { label: "🔴 Abaixo de 70", text: "Atenção: instabilidade relevante.", tone: "bad" },
        ],
      },
    ],
  },
  {
    id: "dns", label: "DNS Intelligence", icon: Globe,
    items: [
      {
        id: "dns-info", title: "O que o DNS Intelligence mostra", icon: Globe,
        body: "A cada checagem consultamos resolvedores globais e registramos o destino do seu domínio.",
        bullets: [
          { label: "IP atual", text: "Para onde o domínio aponta agora." },
          { label: "País e cidade", text: "Localização geográfica do IP." },
          { label: "ASN / Datacenter", text: "Qual provedor hospeda o servidor (ex.: Cloudflare, OVH)." },
          { label: "⚠️ DNS alterado", text: "Detectamos que esse domínio mudou de IP — pode ser troca de servidor, proxy novo ou bloqueio.", tone: "warn" },
        ],
      },
    ],
  },
  {
    id: "speed", label: "Teste de velocidade", icon: Zap,
    items: [
      {
        id: "latencia", title: "Latência e tempo de resposta", icon: Zap,
        body: "Latência é o tempo que o sinal leva para ir e voltar. Quanto menor, melhor a experiência do cliente final.",
        bullets: [
          { label: "50 ms", text: "Excelente.", tone: "ok" },
          { label: "200 ms", text: "Atenção: o cliente pode sentir travadas ao trocar de canal.", tone: "warn" },
          { label: "Tempo de resposta", text: "Quanto o servidor demora para devolver a primeira resposta após o pedido." },
        ],
      },
    ],
  },
  {
    id: "streams", label: "Teste de Streams", icon: Tv,
    items: [
      {
        id: "streams-info", title: "Como testamos os streams", icon: Tv,
        body: "O sistema tenta abrir conteúdos reais do painel, simulando um player, e registra o resultado.",
        bullets: [
          { label: "Live, Filmes e Séries", text: "Cada categoria é testada separadamente." },
          { label: "✅ Abriu corretamente", text: "O stream respondeu e começou a transmitir.", tone: "ok" },
          { label: "❌ Falhou", text: "O conteúdo não abriu no tempo esperado.", tone: "bad" },
          { label: "⏱ Tempo para iniciar", text: "Quanto tempo levou até o vídeo começar." },
        ],
      },
    ],
  },
  {
    id: "ranking", label: "Ranking IPTV", icon: Trophy,
    items: [
      {
        id: "ranking-info", title: "Como o ranking é calculado", icon: Trophy,
        body: "O ranking não é só quantidade de conteúdo: ele mede qualidade real medida pelos testes.",
        bullets: [
          { label: "Saúde do servidor", text: "Peso do Health Score no período." },
          { label: "Velocidade", text: "Latência e tempo de resposta médios." },
          { label: "Estabilidade", text: "Menos quedas = posição melhor." },
          { label: "Validações positivas", text: "Quantidade de checagens bem-sucedidas." },
        ],
      },
    ],
  },
  {
    id: "alerts", label: "Alertas", icon: Bell,
    items: [
      {
        id: "quando", title: "Quando você recebe um alerta", icon: Bell,
        body: "Os alertas avisam no momento em que algo muda, para você agir antes do cliente reclamar.",
        bullets: [
          { label: "Servidor caiu", text: "O host parou de responder aos testes.", tone: "bad" },
          { label: "DNS mudou", text: "O domínio passou a apontar para outro IP.", tone: "warn" },
          { label: "Lentidão detectada", text: "Latência acima do normal por vários ciclos.", tone: "warn" },
          { label: "Perda de desempenho", text: "Queda relevante no Health Score." },
        ],
      },
    ],
  },
  {
    id: "telegram", label: "Integração Telegram", icon: Send,
    items: [
      {
        id: "telegram-conectar", title: "Como conectar o Telegram", icon: Send,
        body: "Você pode receber todos os alertas direto no Telegram, em poucos passos.",
        bullets: [
          { label: "1. Abra o bot", text: "Fale com @MonitordeFluxoBot no Telegram e envie /start." },
          { label: "2. Copie seu Chat ID", text: "O bot responde com o seu código (Chat ID)." },
          { label: "3. Cole em Alertas", text: "Em Alertas, escolha o canal Telegram e cole o Chat ID." },
          { label: "4. Pronto", text: "As notificações passam a chegar automaticamente.", tone: "ok" },
        ],
      },
    ],
  },
  {
    id: "faq", label: "Perguntas frequentes", icon: HelpCircle,
    items: [
      { id: "faq-1", title: "Por que meu servidor aparece offline?", icon: HelpCircle, body: "Na maioria dos casos o host não respondeu dentro do tempo limite: pode ser queda real, firewall bloqueando nosso IP, porta errada ou domínio expirado. Confira o host e a porta no cadastro." },
      { id: "faq-2", title: "Por que minha nota caiu?", icon: HelpCircle, body: "O Health Score usa a média recente. Quedas, lentidão ou falhas na Player API derrubam a nota mesmo que o servidor esteja online agora. Ela sobe de novo conforme os testes voltam a passar." },
      { id: "faq-3", title: "Por que meu DNS mudou?", icon: HelpCircle, body: "Mudança de IP acontece quando o provedor troca de servidor, ativa proxy (como Cloudflare) ou faz balanceamento. Se você não fez nenhuma alteração, vale confirmar com o fornecedor." },
      { id: "faq-4", title: "Por que o teste demora?", icon: HelpCircle, body: "Testes completos abrem listas grandes e conteúdos reais. Em painéis com muitos canais e filmes, a sincronização pode levar alguns minutos na primeira vez." },
      { id: "faq-5", title: "Meus dados ficam seguros?", icon: HelpCircle, body: "Sim. Cada conta enxerga apenas os próprios servidores, os hosts não são exibidos publicamente e as credenciais Xtream são armazenadas criptografadas." },
    ],
  },
];

const STORAGE_KEY = "sm-help-read";
const TONE: Record<string, string> = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  bad: "text-destructive",
};

function HelpCenterPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(CATEGORIES[0].id);
  const [read, setRead] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setRead(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function toggleRead(id: string) {
    setRead((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const match = (i: Item) =>
      !q ||
      i.title.toLowerCase().includes(q) ||
      i.body.toLowerCase().includes(q) ||
      (i.bullets ?? []).some((b) => (b.label + b.text).toLowerCase().includes(q));
    return CATEGORIES
      .map((c) => ({ ...c, items: c.items.filter(match) }))
      .filter((c) => c.items.length > 0);
  }, [q]);

  const visible = q ? filtered : filtered.filter((c) => c.id === active);
  const total = CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden p-6 sm:p-8 border-border/60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.18),transparent_60%)] pointer-events-none" />
        <div className="relative space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Central de Ajuda</h1>
              <p className="text-sm text-muted-foreground">Guia completo do Stream Monitor, em linguagem simples.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Buscar por palavra-chave..." />
            <Badge variant="secondary" className="w-fit">
              {read.length}/{total} tópicos lidos
            </Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="lg:sticky lg:top-20 h-fit">
          <div className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => { setQuery(""); setActive(c.id); }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors text-left",
                  !q && active === c.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground",
                )}
              >
                <c.icon className="h-4 w-4 shrink-0" />
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {visible.length === 0 && (
            <Card className="p-10 text-center border-dashed">
              <p className="text-sm text-muted-foreground">Nenhum tópico encontrado para "{query}".</p>
            </Card>
          )}
          {visible.map((c) => (
            <div key={c.id} className="space-y-4">
              {q && (
                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 pt-2">
                  <c.icon className="h-4 w-4" /> {c.label}
                </h2>
              )}
              {c.items.map((item) => (
                <TopicCard
                  key={item.id}
                  item={item}
                  read={read.includes(item.id)}
                  onToggle={() => toggleRead(item.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopicCard({ item, read, onToggle }: { item: Item; read: boolean; onToggle: () => void }) {
  const Icon: ComponentType<{ className?: string }> = item.icon;
  return (
    <Card className={cn(
      "p-5 transition-all hover:shadow-md hover:-translate-y-0.5 duration-200",
      read && "border-primary/40 bg-primary/[0.03]",
    )}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <h3 className="font-semibold leading-tight">{item.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
          {item.bullets && (
            <ul className="space-y-2">
              {item.bullets.map((b) => (
                <li key={b.label} className="text-sm flex flex-col sm:flex-row sm:gap-2">
                  <span className={cn("font-medium shrink-0", b.tone && TONE[b.tone])}>{b.label}</span>
                  <span className="text-muted-foreground">{b.text}</span>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant={read ? "secondary" : "outline"} onClick={onToggle}>
            <Check className={cn("h-4 w-4 mr-1", read ? "text-emerald-500" : "opacity-50")} />
            {read ? "Lido" : "Entendi"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
