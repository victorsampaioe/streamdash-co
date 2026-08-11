// Plan catalog — used by the subscription page and the (future) Mercado Pago PIX flow.
// Prices are stored in cents to avoid floating-point issues.
export const PLANS = [
    {
        id: "monthly",
        name: "Mensal",
        priceCents: 2500,
        durationDays: 30,
        perks: ["Monitoramento ilimitado", "Alertas em tempo real", "Suporte por e-mail"],
    },
    {
        id: "quarterly",
        name: "Trimestral",
        priceCents: 6500,
        durationDays: 92,
        perks: ["Tudo do Mensal", "Economia de ~14%", "Suporte por e-mail"],
    },
    {
        id: "yearly",
        name: "Anual",
        priceCents: 22000,
        durationDays: 365,
        highlight: true,
        perks: ["Tudo do Mensal", "Economia de ~29%", "Suporte prioritário"],
    },
];
export const CREDIT_PACKS = [
    {
        id: "credits_10",
        name: "10 créditos",
        priceCents: 6000,
        credits: 10,
        perks: ["Painel de Revendedor ativado", "Créditos vitalícios", "Suporte VIP"],
    },
    {
        id: "credits_30",
        name: "30 créditos",
        priceCents: 18000,
        credits: 30,
        perks: ["Tudo do pacote anterior", "Desconto por volume", "Suporte VIP"],
    },
    {
        id: "credits_50",
        name: "50 créditos",
        priceCents: 25000,
        credits: 50,
        highlight: true,
        perks: ["Melhor custo-benefício", "Créditos vitalícios", "Suporte VIP"],
    },
    {
        id: "credits_100",
        name: "100 créditos",
        priceCents: 50000,
        credits: 100,
        perks: ["Melhor custo-benefício", "Créditos vitalícios", "Suporte VIP"],
    },
    {
        id: "credits_200",
        name: "200 créditos",
        priceCents: 100000,
        credits: 200,
        perks: ["Melhor custo-benefício", "Créditos vitalícios", "Suporte VIP"],
    },
    {
        id: "credits_500",
        name: "500 créditos",
        priceCents: 250000,
        credits: 500,
        perks: ["Melhor custo-benefício", "Créditos vitalícios", "Suporte VIP"],
    },
];
// Promoção relâmpago do plano Mensal (válida só hoje, até 23:59 no horário de Brasília).
export const MONTHLY_PROMO = {
    priceCents: 2500,
    endsAt: "2026-08-09T02:59:59.000Z", // 08/08/2026 23:59:59 BRT
    label: "Só hoje",
};
export function isMonthlyPromoActive(now = Date.now()) {
    // Desativado por padrão para usar os novos preços fixos do admin
    return false;
}
// Promoção relâmpago do plano Anual (válida só hoje, até 23:59 no horário de Brasília).
export const YEARLY_PROMO = {
    priceCents: 15000,
    endsAt: "2026-08-02T02:59:59.000Z", // 01/08/2026 23:59:59 BRT
    label: "Só hoje",
};
export function isYearlyPromoActive(now = Date.now()) {
    return false;
}
/** Preço efetivo do plano considerando promoções ativas. */
export function effectivePriceCents(plan, now = Date.now()) {
    if (plan.id === "monthly" && isMonthlyPromoActive(now))
        return MONTHLY_PROMO.priceCents;
    if (plan.id === "yearly" && isYearlyPromoActive(now))
        return YEARLY_PROMO.priceCents;
    return plan.priceCents;
}
// Referral: novo usuário que se cadastrou com código de indicação ganha
// 10% de desconto na PRIMEIRA compra (mensal ou anual).
export const REFERRAL_FIRST_PURCHASE_DISCOUNT = 0.10;
export function formatBRL(cents) {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
