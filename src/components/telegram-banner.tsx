import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Avisa, no painel, quem ainda não cadastrou (ou cadastrou errado) o Telegram. */
export function TelegramBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["telegram-channels-banner"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("alert_channels")
        .select("target, enabled")
        .eq("kind", "telegram");
      return data ?? [];
    },
  });

  if (isLoading || !data) return null;

  const valid = data.filter((c) => {
    const raw = String(c.target ?? "").trim();
    const id = raw.includes(":") ? raw.split(":").slice(-1)[0] : raw;
    return c.enabled && /^-?\d{5,20}$/.test(id);
  });
  if (valid.length > 0) return null;

  const hasInvalid = data.length > 0;

  return (
    <div className="mx-4 mt-4 sm:mx-6 md:mx-8 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        {hasInvalid ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
        ) : (
          <Send className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
        )}
        <div className="text-sm">
          <p className="font-medium">
            {hasInvalid
              ? "Seu Telegram parece estar configurado incorretamente"
              : "Você ainda não cadastrou o Telegram"}
          </p>
          <p className="text-muted-foreground">
            {hasInvalid
              ? "O código informado não é um chat_id válido ou o canal está desativado — você não receberá alertas nem o resumo diário."
              : "Cadastre seu Telegram para receber alertas de queda e o resumo inteligente dos seus servidores."}
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/app/alerts">Cadastrar Telegram</Link>
      </Button>
    </div>
  );
}
