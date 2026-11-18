import {MessageCircle,ExternalLink} from "lucide-react";

/** Official human support for new registrations, trial users and Pix doubts.
 * External Telegram URL is intentionally fixed; never open user-provided links.
 */
export const STREAM_MONITOR_SUPPORT_TELEGRAM="https://t.me/StreamMonitorOfc";

export function NewUserTelegramSupport({compact=false}:{compact?:boolean}){
 return (
  <aside aria-label="Suporte para novos clientes" className={
    "rounded-xl border border-sky-500/25 bg-sky-500/[.06] "+(compact?"p-3":"p-4 sm:p-5")
  }>
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
        <MessageCircle size={16}/> @StreamMonitorOfc <ExternalLink size={14}/>
      </a>
    </div>
  </aside>
 );
}
