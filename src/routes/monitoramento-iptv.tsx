import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from "@/components/ui/button";
import { ShieldCheck, Zap, Bell, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute('/monitoramento-iptv')({
  head: () => ({
    meta: [
      { title: "Monitoramento IPTV Inteligente | Stream Monitor" },
      { name: "description", content: "Analise servidores IPTV, status, latência, disponibilidade e receba alertas automáticos quando houver problemas." },
      { property: "og:title", content: "Monitoramento IPTV Inteligente | Stream Monitor" },
      { property: "og:description", content: "Analise servidores IPTV, status, latência, disponibilidade e receba alertas automáticos quando houver problemas." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://streammonitor.site/monitoramento-iptv" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zowG5KmEoBQiJwfUQDz2ZUEdQ2a2/social-images/social-1783131758542-ChatGPT_Image_3_de_jul._de_2026,_23_22_19.webp" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IptvPage,
});

function IptvPage() {
  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="text-primary hover:underline mb-8 inline-block">← Voltar para o início</Link>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">O que é monitoramento IPTV?</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Monitorar um servidor IPTV vai além de um simples "ping". Envolve verificar se a API está respondendo, se os fluxos de vídeo estão ativos e se a latência permite uma boa experiência para o usuário final.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="text-primary" /> Benefícios
            </h2>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-success shrink-0" /> Redução drástica de reclamações no suporte</li>
              <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-success shrink-0" /> Detecção proativa de quedas de canais ou VOD</li>
              <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-success shrink-0" /> Histórico real de uptime para provar qualidade</li>
            </ul>
          </div>
          <div className="space-y-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="text-primary" /> IPTV Health Score
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Nossa tecnologia exclusiva analisa diversos parâmetros e gera uma nota de 0 a 100% para o seu servidor, facilitando a identificação de instabilidades antes que elas se tornem críticas.
            </p>
          </div>
        </div>

        <div className="bg-card/50 rounded-2xl p-8 border border-border/60 mb-16 text-center">
          <h2 className="text-2xl font-bold mb-4">Pronto para ter controle total do seu IPTV?</h2>
          <Link to="/auth"><Button size="lg" className="glow-primary">Começar agora</Button></Link>
        </div>
      </div>
    </div>
  );
}
