import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { canTrack, onConsentChange, readChoice, saveChoices } from "@/lib/consent";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Privacidade e anúncios — Stream Monitor" },
      { name: "description", content: "Como o Stream Monitor usa dados de navegação para medir anúncios e como desativar o compartilhamento com o Meta." },
      { property: "og:title", content: "Privacidade e anúncios — Stream Monitor" },
      { property: "og:description", content: "Saiba quais dados o Stream Monitor compartilha com o Meta para medir anúncios e como recusar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [gpc, setGpc] = useState(false);
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setRefused(readChoice("advertising") === "denied");
      setGpc((navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
      void canTrack("advertising").then(setAllowed);
    };
    refresh();
    return onConsentChange(refresh);
  }, []);

  function toggle(value: boolean) {
    saveChoices({ advertising: value ? "granted" : "denied" });
    setAllowed(value);
    setRefused(!value);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <article className="mx-auto max-w-2xl space-y-6">
        <Link to="/" className="text-sm text-primary hover:underline">← Voltar ao início</Link>
        <h1 className="flex items-center gap-2 text-3xl font-black"><ShieldCheck className="h-7 w-7 text-primary" /> Privacidade e anúncios</h1>
        <p className="text-muted-foreground">
          O Stream Monitor anuncia no Facebook. Para saber quais anúncios trazem visitas e cadastros, usamos o Pixel do Meta nas páginas públicas do site.
        </p>
        <section className="space-y-2">
          <h2 className="text-lg font-bold">O que é compartilhado com o Meta</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>A visita a uma página pública (por exemplo, a página inicial ou a de cadastro).</li>
            <li>O aviso de que uma conta foi criada, sem nome, e-mail, telefone ou senha.</li>
            <li>Identificadores técnicos do navegador e cookies do próprio Meta, usados para medir e melhorar a entrega dos anúncios.</li>
          </ul>
          <p className="text-sm text-muted-foreground">O painel, o player e as áreas logadas não enviam dados ao Meta.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Sua escolha</h2>
          <p className="text-sm text-muted-foreground">
            No Brasil o compartilhamento fica ligado até você recusar. Na União Europeia, Reino Unido, Suíça e Canadá ele fica desligado, a menos que você ligue aqui. Se o seu navegador envia o sinal de privacidade (Global Privacy Control), nada é compartilhado.
          </p>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
            <label htmlFor="ads-consent" className="text-sm font-medium">Compartilhar dados de navegação com o Meta para medir anúncios</label>
            <Switch id="ads-consent" checked={allowed === true && !gpc} disabled={allowed === null || gpc} onCheckedChange={toggle} />
          </div>
          {gpc && <p className="text-xs text-muted-foreground">O sinal de privacidade do seu navegador está ativo, por isso o compartilhamento fica desligado.</p>}
          {refused && !gpc && <p className="text-xs text-muted-foreground">Você recusou. Nada novo é enviado ao Meta a partir deste navegador.</p>}
        </section>
        <p className="text-xs text-muted-foreground">Dúvidas sobre seus dados: fale com a gente pelo canal do Telegram informado no rodapé do site.</p>
      </article>
    </main>
  );
}
