import { Activity, ServerCog, Search, Gauge, Smartphone } from "lucide-react";

const ITENS = [
  {
    icon: Activity,
    title: "Diagnóstico inteligente",
    desc: "Cada canal e filme é testado antes de tocar.",
  },
  {
    icon: ServerCog,
    title: "Servidores monitorados",
    desc: "Acompanhamos a saúde dos servidores em tempo real.",
  },
  {
    icon: Search,
    title: "Conteúdo em vários servidores",
    desc: "Se um falhar, buscamos o mesmo título em outro.",
  },
  {
    icon: Gauge,
    title: "Reprodução otimizada",
    desc: "Entrega ajustada para abrir rápido e travar menos.",
  },
  {
    icon: Smartphone,
    title: "Aplicativo Android",
    desc: "Leve o catálogo para a TV e o celular.",
  },
];

/**
 * Seção leve (sem imagens, sem requisições) explicando que o Stream Monitor
 * Play é uma plataforma inteligente, não apenas um player.
 */
export function PlatformHighlights({ primaryColor }: { primaryColor: string }) {
  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
      <header className="mb-5">
        <h2 className="text-lg md:text-xl font-bold text-white">
          Por que o Stream Monitor Play é diferente
        </h2>
        <p className="text-sm text-white/50">
          Não é só um player: é uma plataforma que monitora e escolhe o melhor caminho para o seu conteúdo.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITENS.map(({ icon: Icon, title, desc }) => (
          <li
            key={title}
            className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3.5"
          >
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${primaryColor}1f`, color: primaryColor }}
            >
              <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                {title}
              </p>
              <p className="text-xs leading-relaxed text-white/50">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
