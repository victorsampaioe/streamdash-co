// Plan catalog — used by the subscription page and the (future) Mercado Pago PIX flow.
// Prices are stored in cents to avoid floating-point issues.

export type PlanId = "monthly" | "yearly";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  priceCents: number;
  durationDays: number;
  highlight?: boolean;
  perks: string[];
};

export const PLANS: PlanDefinition[] = [
  {
    id: "monthly",
    name: "Mensal",
    priceCents: 2990,
    durationDays: 30,
    perks: ["Monitoramento ilimitado", "Alertas em tempo real", "Suporte por e-mail"],
  },
  {
    id: "yearly",
    name: "Anual",
    priceCents: 29900,
    durationDays: 365,
    highlight: true,
    perks: ["Tudo do Mensal", "2 meses grátis", "Suporte prioritário"],
  },
];

export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
