import { Send } from "lucide-react";

const SUPPORT_URL = "https://t.me/StreamMonitorOfc";

export function SupportFab() {
  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Suporte no Telegram (@StreamMonitorOfc)"
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 h-14 w-14 hover:w-auto hover:pl-4 hover:pr-5 transition-all duration-300 overflow-hidden"
    >
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-10 w-10 rounded-full bg-primary-foreground/20 animate-ping" />
        <Send className="relative h-6 w-6" />
      </span>
      <span className="hidden group-hover:inline whitespace-nowrap text-sm font-medium pr-1">
        Suporte no Telegram
      </span>
    </a>
  );
}
