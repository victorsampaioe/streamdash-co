import {CheckCircle2,Coins,Info,Users} from "lucide-react";

/** Text reflects today's enforcement: positive credits -> reseller active;
 * no automatic four-month expiration is configured on the backend.
 */
export function ResellerCreditRules({compact=false}:{compact?:boolean}){
 return <section aria-label="Como funcionam os créditos da revenda"
   className="rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-blue-950/30 via-card to-card px-4 py-5 sm:p-6">
   <div className="flex items-center gap-2">
     <Coins className="h-5 w-5 shrink-0 text-blue-400"/>
     <h2 className="text-lg font-black">Como funciona ser revendedor?</h2>
   </div>
   <p className="mt-2 text-sm leading-6 text-muted-foreground">
     Com créditos disponíveis, seu painel de revenda permanece operacional e você pode
     cadastrar clientes e oferecer seus próprios planos.
     Você pode continuar ativo por <strong className="text-foreground">4 meses ou mais</strong>
     {" "}enquanto mantiver saldo positivo. Atualmente, não existe vencimento automático da revenda ao completar quatro meses.
   </p>
   <div className={"mt-4 grid gap-3 "+(compact?"grid-cols-1":"sm:grid-cols-2")}>
     <div className="flex items-start gap-2 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
       <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-blue-400"/>
       <p className="text-xs leading-5"><b>1 crédito = 1 mês de acesso para um cliente.</b> O saldo é utilizado para liberar os planos que você vende.</p>
     </div>
     <div className="flex items-start gap-2 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
       <Users size={17} className="mt-0.5 shrink-0 text-blue-400"/>
       <p className="text-xs leading-5"><b>Venda pelo seu preço.</b> O lucro depende do preço cobrado e dos seus custos. Para criar uma sub-revenda, o mínimo é 10 créditos.</p>
     </div>
   </div>
   <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-200/90">
     <Info size={15} className="mt-0.5 shrink-0"/>
     Se os créditos chegarem a zero, novos cadastros e o monitoramento próprio ficam pausados até recarregar. Créditos em saldo não expiram apenas porque se passaram quatro meses.
   </p>
 </section>
}
