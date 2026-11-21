# Cloudflare Pages preview (Stream Monitor)

Projeto de pré-visualização: `streammonitor-cloudflare-preview.pages.dev`.

Origem: repositório `victorsampaioe/streamdash-co`, ramo `main`.
Build: `npm run build`. Diretório de saída inicial: `.output/public`.

Este ambiente é de teste e **não substitui** o domínio `streammonitor.site`.
Nenhum registro DNS de produção deve ser alterado antes de validar build SSR, autenticação, pagamentos e rotas de API.

A origem de dados permanece Lovable Cloud. Uma implantação de interface não prova migração do banco.

Ações de liberação: validar o build do Nitro/TanStack Start na Cloudflare, acesso às páginas e APIs, variáveis de ambiente, rotas SSR, proteção dos segredos e login; só depois preparar DNS e rollback.
