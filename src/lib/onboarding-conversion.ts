/**
 * A limited, non-intrusive in-app introduction for newly registered users.
 * Five possible windows (hours 1..5); never email, push or notify offline.
 * We do not backfill missed windows or repeatedly nag after six hours.
 */
export const CONVERSION_REMINDER_LIMIT=5;
export const CONVERSION_REMINDER_HOUR_MS=60*60*1000;
export const CONVERSION_REMINDER_MESSAGES=[
  {
    title:"Sua conta está pronta para começar",
    message:"Por R$ 25/mês, monitore DNS, HTTP e SSL dos seus servidores em um único painel. Ative por Pix quando decidir.",
    cta:"Conhecer plano de R$ 25",
  },
  {
    title:"Descubra o problema antes dos clientes",
    message:"Receba alertas de falha e recuperação no Telegram e acompanhe o histórico de incidentes. A ativação exige uma assinatura válida.",
    cta:"Ver vantagens do Stream Monitor",
  },
  {
    title:"Sua revenda com divulgação profissional",
    message:"Conheça a Vitrine IA de filmes e séries, os banners de futebol e vídeos personalizados com logo e WhatsApp.",
    cta:"Explorar recursos e planos",
  },
  {
    title:"Quer também ganhar com revenda?",
    message:"O pacote inicial tem 10 créditos por R$ 60. Cada crédito corresponde a um mês de acesso de cliente; você define seu preço de revenda. Seu painel de revendedor funciona enquanto mantiver créditos disponíveis.",
    cta:"Conhecer créditos para revender",
  },
  {
    title:"Escolha como usar o Stream Monitor",
    message:"Você pode assinar por R$ 25/mês para monitorar seus servidores ou adquirir créditos para criar e atender seus próprios clientes. Sem promessas de lucro: o resultado depende das suas vendas.",
    cta:"Comparar as opções",
  },
] as const;
/** Return the current hour 1..5 if the user is within that hour after signup.
 * A visitor returning the next day is never shown a backlog of five messages.
 */
export function getConversionReminderStep(createdAt:string,now:number):number|null{
  const start=Date.parse(createdAt);
  if(!Number.isFinite(start)||!Number.isFinite(now))return null;
  const elapsed=now-start;
  if(elapsed<CONVERSION_REMINDER_HOUR_MS||
      elapsed>=CONVERSION_REMINDER_HOUR_MS*(CONVERSION_REMINDER_LIMIT+1))return null;
  const hour=Math.floor(elapsed/CONVERSION_REMINDER_HOUR_MS);
  return Math.max(1,Math.min(CONVERSION_REMINDER_LIMIT,hour));
}
