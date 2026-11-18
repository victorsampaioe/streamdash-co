import {formatBRL} from "./payments";

export type AdminPaymentNoticeData={
  name:string|null; email:string|null;plan:string|null;
  amountCents:number;paymentId:string;paidAt:string|null;expiresAt:string|null;
  paymentType?:string|null;
};

const esc=(value:string)=>value.replace(/[&<>"]/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
} as Record<string,string>)[c]||c);

function localDate(iso:string|null){
  if(!iso)return "—";
  const time=Date.parse(iso);
  if(!Number.isFinite(time))return "—";
  return new Intl.DateTimeFormat("pt-BR",{
    timeZone:"America/Fortaleza",day:"2-digit",month:"2-digit",
    year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,
  }).format(new Date(time));
}

/** An admin receipt, not a second charge or a subscription mutation. */
export function formatAdminPaymentReceipt(data:AdminPaymentNoticeData){
  const type=data.paymentType==="store"?"🛍️ <b>Venda confirmada</b>"
    :data.paymentType==="api_subscription"?"🔌 <b>Pagamento API confirmado</b>"
    :"💰 <b>Novo pagamento confirmado!</b>";
  const plan=({monthly:"Mensal",quarterly:"Trimestral",yearly:"Anual",
    basic:"Básico",reseller:"Revendedor"} as Record<string,string>)[data.plan||""]||data.plan||"Não informado";
  const name=data.name?.trim()||"Cliente";
  const email=data.email?.trim()||"Não informado";
  return [
    type,
    "",
    `👤 Cliente: <b>${esc(name)}</b>`,
    `📧 E-mail: ${esc(email)}`,
    `💳 Plano: <b>${esc(plan)}</b>`,
    `💵 Valor: <b>${formatBRL(data.amountCents)}</b>`,
    `✅ Status: <b>APROVADO</b>`,
    `🕘 Confirmado: ${localDate(data.paidAt)} (Fortaleza)`,
    ...(data.expiresAt?[`📅 Vencimento: ${localDate(data.expiresAt)} (Fortaleza)`]:[]),
    `🔖 ID interno: <code>${esc(data.paymentId)}</code>`,
    "",
    "🚀 Stream Monitor • Pagamento verificado pelo Mercado Pago",
  ].join("\n");
}
