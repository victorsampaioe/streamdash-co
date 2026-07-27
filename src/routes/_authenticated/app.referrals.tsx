import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, Gift, Share2, Users, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/referrals")({
  head: () => ({
    meta: [
      { title: "Indicações — StreamMonitor" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralsPage,
});

type ReferralRow = {
  id: string;
  referred_id: string;
  code_used: string;
  converted_at: string | null;
  reward_granted_at: string | null;
  created_at: string;
};

function ReferralsPage() {
  const { data: me } = useQuery({
    queryKey: ["my-profile-referral"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, referral_code, full_name")
        .eq("id", u.user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: referrals } = useQuery({
    queryKey: ["my-referrals"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [] as ReferralRow[];
      const { data } = await supabase
        .from("referrals")
        .select("id, referred_id, code_used, converted_at, reward_granted_at, created_at")
        .eq("referrer_id", u.user.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as ReferralRow[];
    },
  });

  const code = me?.referral_code ?? "";
  // Always use the public site domain, never the lovable preview/staging URL.
  const PUBLIC_SITE = "https://streammonitor.site";
  const shareUrl = code ? `${PUBLIC_SITE}/auth?ref=${code}` : "";

  const total = referrals?.length ?? 0;
  const converted = referrals?.filter((r) => r.reward_granted_at).length ?? 0;
  const pending = total - converted;
  const monthsEarned = converted; // 1 month per conversion

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  }

  async function share() {
    if (navigator.share && shareUrl) {
      try {
        await navigator.share({
          title: "StreamMonitor",
          text: "Monitore seus servidores com o StreamMonitor. Use meu código e ganhe 10 dias grátis!",
          url: shareUrl,
        });
      } catch {}
    } else {
      copy(shareUrl, "Link");
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="h-6 w-6 text-primary" /> Programa de Indicações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compartilhe seu código. Cada pessoa que se cadastrar ganha <strong>10 dias grátis</strong>. Quando ela assinar,
          você ganha <strong>+1 mês</strong> na sua assinatura.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Metric icon={Users} label="Indicações" value={String(total)} />
        <Metric icon={Clock} label="Aguardando pagamento" value={String(pending)} />
        <Metric icon={CheckCircle2} label="Meses ganhos" value={String(monthsEarned)} highlight />
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Seu código</h2>
          <p className="text-xs text-muted-foreground">Compartilhe com quem quiser.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={code} className="font-mono text-lg tracking-widest text-center sm:max-w-xs" />
          <Button variant="outline" onClick={() => copy(code, "Código")}>
            <Copy className="h-4 w-4 mr-2" /> Copiar código
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input readOnly value={shareUrl} className="text-xs" />
          <Button onClick={share}>
            <Share2 className="h-4 w-4 mr-2" /> Compartilhar link
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Histórico de indicações</h2>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma indicação ainda. Comece compartilhando seu código!</p>
        ) : (
          <div className="space-y-2">
            {referrals!.map((r) => (
              <div key={r.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">#{r.referred_id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                {r.reward_granted_at ? (
                  <Badge className="bg-success text-success-foreground">+1 mês creditado</Badge>
                ) : (
                  <Badge variant="outline">Aguardando assinatura</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={"p-4 " + (highlight ? "border-primary/50 bg-primary/5" : "")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </Card>
  );
}
