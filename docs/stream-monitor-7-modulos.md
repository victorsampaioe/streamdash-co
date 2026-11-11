# Stream Monitor — implantação dos sete módulos (11/11/2026)

**Banco único:** Lovable Cloud do projeto existente (PostgreSQL, Auth e Storage). Sem Supabase externo ou Cloudflare D1.

| Módulo | Implementação comprovada | Não confirmado / dependência |
|---|---|---|
| 1. Escudo de Segurança | Cloudflare WAF custom para bloquear paths de exploração e rate limiting 60 requisições/10s por IP nos caminhos públicos de ajuda e catálogo. Regras gerenciadas Cloudflare já existentes. | Turnstile na Central de Ajuda requer validação server-side e não foi conectado. |
| 2. Memória de Diagnósticos | `diagnostic_case_memory` com RLS; página `/app/memoria`; `get_public_help_resolutions` entrega somente soluções resolvidas, consentidas e anonimizadas; integração em `/ajuda/$slug`. | AI Search vetorial não foi configurado; dicas são baseadas nos casos anteriores, não em geração IA nova. |
| 3. Telegram Delivery Guard | Tabela `telegram_outbox`; claim atômico com `FOR UPDATE SKIP LOCKED`; backoff, dead letters, log pós-entrega e cron existente em `/api/public/cron/monitor`. | Cloudflare Queue `streammonitor-telegram-delivery` foi **criada**, mas não está conectada a produtor/consumidor; a fila funcional permanece Lovable Cloud. |
| 4. Biblioteca de Evidências | `/app/evidencias`, PDF de incidente, upload PNG/PDF/CSV/JSON, histórico, links assinados; bucket privado `stream-evidence` com RLS por pasta do revendedor. | R2 ainda está desabilitado na conta Cloudflare. |
| 5. Auditoria Visual | `/app/auditoria` e `runVisualAudit` restrito a admin, histórico `visual_audit_checks`, HTTP de fallback. Browser Rendering respondeu 200 em verificação manual da Cloudflare. | Captura dentro do aplicativo exige `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` como segredos no servidor. Cron 1–2x/dia pendente. |
| 6. Radar Histórico de Falhas | `/app/falhas` lê incidentes e checagens reais por hora e servidor, mostra dados limitados explicitamente e exporta CSV com proteção contra fórmulas. | Não afirmar que DNS/HTTP online confirma IPTV reproduzindo. |
| 7. Vitrine IA | `/app/divulgacao`, quatro modelos, feed/story/paisagem, logo, marca, contato, seleção de títulos TMDB, PNG, histórico no bucket privado `promo-arts` do Lovable Cloud. | A legenda atual usa modelo de texto, não IA generativa; R2 e gerador generativo dependem de integração adicional. `TMDB_API_KEY` deve estar configurada como segredo server-side. |

## Banco e armazenamento
Tabelas novas com RLS: `promo_brand_settings`, `promo_generations`, `diagnostic_case_memory`, `evidence_documents`, `visual_audit_checks`. `telegram_outbox` também tem RLS; função de claim limitada à service role. Buckets privados `promo-arts` e `stream-evidence` exigem arquivos sob pasta `auth.uid()/`; acesso via URL assinada com validade curta. Nenhum token ou chave TMDB deve ser enviado ao frontend ou commitado em arquivos.

## Critérios de aceite antes de anunciar como disponível
- CI: `bun install --frozen-lockfile`, `bunx vitest run`, `bunx tsc --noEmit`, `bun run build`.
- Revendedor A: salvar marca, PNG, PDF, abrir históricos por links assinados, conferir que revendedor B não enxerga os arquivos de A.
- Ajuda pública: caso consentido aparece no link da revenda correta; caso não consentido não aparece; não expor host nem credenciais IPTV.
- Telegram: falhar e recuperar em ambiente de teste, validar `pending → processing → sent`, `dead`, OFFLINE/ONLINE, sem duplicar mensagens.
- Cloudflare: testar acesso legítimo às páginas públicas, verificar bloqueio de probes e rate-limit.
- Auditoria Visual: distinguir check HTTP parcial de screenshot real; medir erro e recuperação.

**Status:** alterações de código e banco realizadas diretamente. O commit no GitHub sozinho não comprova build, homologação nem publicação do domínio. Não anunciar as dependências externas como ativas até confirmar configuração e testes.
