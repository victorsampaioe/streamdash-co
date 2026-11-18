import {MessageCircle,ExternalLink,Users,Send} from "lucide-react";

/**
 * Telegram links officially shared by Stream Monitor.
 * The community invite is optional and never required for registration,
 * plan activation or payment.
 */
export const STREAM_MONITOR_SUPPORT_TELEGRAM="https://t.me/StreamMonitorOfc";
export const STREAM_MONITOR_COMMUNITY_TELEGRAM="https://t.me/+RId642Ac4AFkOWFh";

export function NewUserTelegramSupport({compact=false}:{compact?:boolean}){
 return (
  <aside aria-label="Canais oficiais Stream Monitor no Telegram"
   className={"rounded-xl border border-sky-500/25 bg-sky-500/[.06] "+(compact?"p-3":"p-4 sm:p-5")}>
   <div className="flex flex-col gap-4">
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
     <div className="flex min-w-0 items-start gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
       <MessageCircle size={19}/>
      </span>
      <div>
       <p className="text-sm font-bold text-foreground">Precisa de ajuda para começar?</p>
       <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Dúvidas sobre cadastro, planos, créditos de revenda ou pagamento Pix?
        Fale com o suporte oficial pelo Telegram.
       </p>
      </div>
     </div>
     <a href={STREAM_MONITOR_SUPPORT_TELEGRAM} target="_blank" rel="noopener noreferrer"
      className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-500/35 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-300 transition hover:bg-sky-500/20 sm:w-auto">
      <MessageCircle size={16}/> Falar com o suporte <ExternalLink size={14}/>
     </a>
    </div>
    <div className="border-t border-sky-500/20 pt-4">
     <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
       <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
        <Users size={19}/>
       </span>
       <div>
        <p className="text-sm font-bold text-foreground">Quer acompanhar nossas novidades?</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
         Entre no canal oficial do Stream Monitor para receber notícias, atualizações
         e novidades sobre monitoramento, parceiros e ferramentas.
         A participação é opcional e não substitui os alertas individuais do seu painel.
        </p>
       </div>
      </div>
      <a href={STREAM_MONITOR_COMMUNITY_TELEGRAM} target="_blank" rel="noopener noreferrer"
       className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-400/35 bg-blue-500/15 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/25 sm:w-auto">
       <Send size={16}/> Entrar no canal <ExternalLink size={14}/>
      </a>
     </div>
    </div>
   </div>
  </aside>
 );
}
