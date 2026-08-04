// Plan catalog — used by the subscription page and the (future) Mercado Pago PIX flow.
// Prices are stored in cents to avoid floating-point issues.

export type PlanId = "monthly" | "yearly" | "credits_10" | "credits_30" | "credits_50";

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
    priceCents: 3500,
    durationDays: 30,
    perks: ["Monitoramento ilimitado", "Alertas em tempo real", "Suporte por e-mail"],
  },
  {
    id: "yearly",
    name: "Anual",
    priceCents: 29900,
    durationDays: 365,
    highlight: true,
    perks: ["Tudo do Mensal", "Economia de ~29%", "Suporte prioritário"],
  },
];

// Promoção relâmpago do plano Mensal (válida só hoje, até 23:59 no horário de Brasília).
export const MONTHLY_PROMO = {
  priceCents: 2500,
  endsAt: "2026-08-04T02:59:59.000Z", // 03/08/2026 23:59:59 BRT
  label: "Só hoje",
};

export function isMonthlyPromoActive(now: number = Date.now()) {
  return now < Date.parse(MONTHLY_PROMO.endsAt);
}

// Promoção relâmpago do plano Anual (válida só hoje, até 23:59 no horário de Brasília).
export const YEARLY_PROMO = {
  priceCents: 15000,
  endsAt: "2026-08-02T02:59:59.000Z", // 01/08/2026 23:59:59 BRT
  label: "Só hoje",
};

export function isYearlyPromoActive(now: number = Date.now()) {
  return now < Date.parse(YEARLY_PROMO.endsAt);
}

/** Preço efetivo do plano considerando promoções ativas. */
export function effectivePriceCents(plan: PlanDefinition, now: number = Date.now()) {
  if (plan.id === "monthly" && isMonthlyPromoActive(now)) return MONTHLY_PROMO.priceCents;
  if (plan.id === "yearly" && isYearlyPromoActive(now)) return YEARLY_PROMO.priceCents;
  return plan.priceCents;
}

// Referral: novo usuário que se cadastrou com código de indicação ganha
// 10% de desconto na PRIMEIRA compra (mensal ou anual).
export const REFERRAL_FIRST_PURCHASE_DISCOUNT = 0.10;


export function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
