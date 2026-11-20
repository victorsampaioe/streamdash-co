# Publicação independente — Stream Monitor na Cloudflare

**Objetivo:** executar o frontend TanStack Start e os endpoints do bot em um
Cloudflare Worker com GitHub como repositório, sem Lovable como editor, builder
ou origin. A publicação real deverá ser feita somente quando houver validação
de login, SSR, pagamentos, webhook do Telegram e proteção contra duplicatas.

## Situação em 20/11/2026
- **Producao (não alterar antes do corte):** `streammonitor.site` e
  `www.streammonitor.site` ainda resolvem para `185.158.133.1` e ficam
  com DNS-only no Cloudflare. Este é o origin antigo.
- **Workers existentes:** ativações/Pix/DNS e demais serviços já rodam na
  Cloudflare; devem permanecer em seus respectivos Workers.
- **Frontend atual:** TanStack Start, Vite e configuração
  `@lovable.dev/vite-tanstack-config`; SSR com funções que usam variáveis
  privadas de servidor, autenticação Supabase e alguns endpoints legados.
- **Esta branch é preparatória:** `wrangler.jsonc` define um Worker
  `streammonitor-web-staging` **sem** domínio de produção. É necessário
  validar a saída Nitro do build antes de tentar o primeiro deploy.

## Antes de publicar
1. Conectar o GitHub a **Workers Builds** na Cloudflare e vincular o repositório
   `victorsampaioe/streamdash-co` à branch específica de migração. Essa
   autorização GitHub/Cloudflare deve ser concluída pelo titular se ainda não
   estiver conectada.
2. Criar/verificar Worker `streammonitor-web-staging`, configurado para
   `bun install --frozen-lockfile && bun run build` e
   `npx wrangler deploy`. O output esperado é
   `.output/server/index.mjs` e `.output/public`; **verificar no log**,
   não presumir sucesso.
3. Migrar as variáveis e segredos da aplicação com segurança: autenticação,
   serviço de banco, Telegram, webhooks, pagamentos e quaisquer outros
   usados por `src/routes/api/**`. Não colocar credenciais no GitHub.
4. Verificar dependências runtime do pacote antigo Lovable; remover ou
   substituir o wrapper Vite por configuração Cloudflare nativa caso
   falhe no Workers, atualizando o lockfile de forma consistente.
5. Testes em hostname de staging **sem alterar DNS**: páginas públicas,
   hidratação, login/cadastro, painel autenticado, consultas D1,
   checkout (sem cobrança duplicada), callbacks, webhooks e Telegram.
6. Só depois migrar apex e `www` para o Worker testado, habilitar
   TLS/proxy e monitorar a transição. Manter a capacidade de rollback.
7. Não excluir o origin antigo até validar totalmente a implantação e
   importação de todas as dependências relevantes.

**Nunca publicar uma tela estática como substituição da aplicação
autenticada sem testes.** Cloudflare para hospedagem/publicação; GitHub
para código-fonte. Não chamar o Lovable.
