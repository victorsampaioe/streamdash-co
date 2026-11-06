import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/blog/dns-iptv-nao-resolve")({
  head: () => ({
    meta: [
      { title: "DNS IPTV Não Resolve: Causas e Diagnóstico | Stream Monitor" },
      { name: "description", content: "Seu DNS IPTV parou de resolver? Entenda NXDOMAIN, SERVFAIL, timeout, propagação, alteração de IP e como verificar a disponibilidade do domínio." },
      { property: "og:title", content: "DNS IPTV não resolve: o que verificar | Stream Monitor" },
      { property: "og:description", content: "Guia para investigar falhas de DNS e distinguir problemas do domínio de indisponibilidade do servidor." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://streammonitor.site/blog/dns-iptv-nao-resolve" },
    ],
    links: [{ rel: "canonical", href: "https://streammonitor.site/blog/dns-iptv-nao-resolve" }],
  }),
  component: Article,
});

function Article() {
  return <main className="min-h-screen bg-background px-4 py-14 text-foreground sm:py-20">
    <article className="mx-auto max-w-3xl space-y-8 leading-relaxed">
      <Link to="/blog" className="inline-block text-sm text-primary hover:underline">← Voltar ao blog</Link>
      <header className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Monitoramento DNS</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-5xl">DNS IPTV não resolve: causas e como investigar</h1>
        <p className="text-lg text-muted-foreground">Quando o domínio de um servidor não resolve, o acesso pode falhar mesmo com a máquina de origem ligada. Saiba quais sinais observar antes de alterar configurações ou anunciar uma queda.</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">O que significa “DNS não resolve”?</h2>
        <p>Uma consulta DNS busca os registros que associam um nome, como painel.exemplo.com, a endereços de rede. Falhas podem vir do domínio, do provedor de DNS, da delegação ou do caminho entre cliente e resolvedor. Nem todo erro significa que o servidor de origem saiu do ar.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Entenda os erros mais comuns</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>NXDOMAIN:</strong> indica que o nome consultado não existe segundo a resposta do DNS. Confira digitação, subdomínio e registros na zona.</li>
          <li><strong>SERVFAIL:</strong> o resolvedor não conseguiu completar a consulta. Pode existir erro de delegação, validação DNSSEC ou problema temporário.</li>
          <li><strong>Timeout:</strong> não houve resposta no prazo. Isso pode ocorrer por instabilidade, perda de pacotes ou bloqueio no caminho.</li>
          <li><strong>Resposta sem registro A:</strong> o domínio pode ter outros registros, como AAAA ou CNAME. Avalie a configuração esperada antes de declarar indisponibilidade.</li>
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Como verificar uma possível queda de DNS</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>Confirme o nome completo do host, sem caminho ou credenciais.</li>
          <li>Compare consultas em pelo menos dois provedores DNS independentes.</li>
          <li>Verifique registros A, AAAA, CNAME e NS conforme a infraestrutura usada.</li>
          <li>Compare os IPs atuais com o histórico conhecido. CDNs podem utilizar múltiplos endereços válidos.</li>
          <li>Consulte o TTL e confirme se houve mudança recente na zona ou na delegação.</li>
          <li>Repita a verificação após um intervalo adequado e analise se a falha também ocorre em outras regiões.</li>
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Propagação DNS é igual a queda?</h2>
        <p>Não necessariamente. Depois de alterar registros, alguns resolvedores podem manter respostas antigas até o fim do TTL. Uma propagação parcial pode ser temporária e afetar grupos específicos de usuários. Evite trocar o domínio ou mexer repetidamente no IP sem comparar o histórico e a configuração autoritativa.</p>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Quando avisar os clientes?</h2>
        <p>Uma resposta isolada de timeout não comprova queda geral. Combine falhas consecutivas, diferentes resolvedores e informações do estado HTTP do servidor. Quando o DNS está indisponível, mas o servidor responde por outro endereço autorizado, o aviso deve especificar que o problema é de resolução, não necessariamente do serviço inteiro.</p>
      </section>
      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 space-y-4">
        <h2 className="text-2xl font-bold">Monitore alterações DNS com histórico e alertas</h2>
        <p>O Stream Monitor reúne consultas de DNS, mudanças de IP, estado de servidores e notificações para facilitar o diagnóstico de revendedores.</p>
        <div className="flex flex-wrap gap-4 text-sm font-medium text-primary">
          <Link to="/monitoramento-dns" className="underline">Monitoramento DNS</Link>
          <Link to="/monitoramento-iptv" className="underline">Monitoramento IPTV</Link>
          <Link to="/alertas-telegram" className="underline">Alertas Telegram</Link>
        </div>
        <Link to="/auth"><Button>Conhecer Stream Monitor</Button></Link>
      </section>
    </article>
  </main>;
}
