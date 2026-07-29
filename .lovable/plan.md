# Hub Stream — Comunidade Stream Monitor

Área exclusiva para **assinantes ativos** (trial/active), acessível em `/app/hub`. Reúne Marketplace, Serviços, Parceiros, Mural "Preciso de Ajuda", Chat interno e Reputação em um só lugar. Bloqueada para expirados via o `GatedOutlet` já existente.

## Escopo desta entrega (v1)

Prioridade em fundação sólida + fluxos principais. Recursos "opcionais" ficam preparados no schema mas não têm UI nesta v1.

### Incluído
1. **Anúncios (Marketplace + Serviços + Mural)** — um único modelo `listings` com `kind` (`offer` / `demand`) e `category` (marketplace: créditos, painel, servidor dedicado, VPS, hospedagem, CDN, proxy, domínio, cloudflare, outros; serviços: config painel, instalação, migração, DNS, dev, bot telegram, site, landing, app; ajuda: help).
2. **Chat privado** entre 2 usuários, com fio por anúncio (`conversations` + `messages`). Realtime via Supabase.
3. **Reputação** — avaliações 1–5 estrelas por transação, badge "Assinante Premium" (ativo), "Verificado" (documento aprovado pelo admin), tempo na plataforma, contagem de negócios.
4. **Perfil público do vendedor/técnico** em `/app/hub/u/:handle`.
5. **Verificação** — usuário envia documento (Storage bucket `hub-docs`), admin aprova em `/app/admin` (nova aba).
6. **Botão "Tenho interesse"** em anúncio → cria conversa e leva direto ao chat.
7. **Ranking** — top vendedores, top técnicos, top avaliados (últimos 30 dias).
8. **Notificações Telegram** — quando alguém tem interesse ou envia mensagem no chat, o dono recebe no bot já existente (@MonitordeFluxoBot), se tiver telegram vinculado (fase 2 do telegram; nesta v1 já disparamos para admin).
9. **Anti-abuso** — rate-limit de anúncios (5/dia por usuário), tamanho máx de texto, sanitização; nenhum campo aceita telefone/WhatsApp/URL externa antes do "Compartilhar contato" (regex de bloqueio no cliente + trigger no banco que registra flag para moderação).

### Fora do escopo v1 (preparado no schema, sem UI)
- Comissão/intermediação de pagamento, destaque pago, Plano Premium do Hub, vagas/novidades. Ficam como categorias/flags no schema para evoluir.

## UX / rotas

- `/app/hub` — home com abas: **Vitrine** (feed misto de ofertas), **Preciso de Ajuda** (demandas), **Serviços**, **Parceiros**, **Ranking**.
  Filtros: categoria, localização (texto), preço, apenas verificados.
- `/app/hub/new` — criar anúncio (wizard: tipo → categoria → título/descrição → preço/localização opcionais → publicar).
- `/app/hub/l/:id` — detalhe do anúncio: dados, autor com reputação, botão **Tenho interesse** (abre chat), botão **Denunciar**.
- `/app/hub/messages` — inbox de conversas + painel de chat (2 colunas no desktop, empilhado no mobile).
- `/app/hub/u/:handle` — perfil público: bio, badges (Verificado, Premium, Tempo, Negócios, ⭐ média), anúncios ativos, últimas avaliações.
- `/app/hub/verification` — envio de documento + status.
- `/app/admin` — nova aba **Hub**: fila de verificações, denúncias, remover anúncio.

Design segue o sistema atual (tokens em `src/styles.css`, shadcn, dark mode). Cards com selos coloridos: azul = Premium, verde = Verificado, âmbar = Top.

## Segurança e RLS (resumo)

- Todas as tabelas ativam RLS e usam `has_role(auth.uid(),'admin')` para overrides.
- Só **assinante ativo** pode criar anúncio/conversa (função `subscription_is_active` já existe; usada em política + em `check`).
- Anúncios: SELECT permitido a `authenticated` (feed é dentro do painel). Autor gerencia os próprios (INSERT/UPDATE/DELETE). Admin idem.
- Conversas e mensagens: só participantes leem/escrevem. Nenhum acesso `anon`.
- Documentos de verificação: bucket privado, só o dono + admin veem.
- Trigger `hub_pre_check_contact` marca `flagged=true` quando detecta padrões de telefone/URL antes do "Compartilhar contato" (não bloqueia, só sinaliza para moderação — evita fricção).
- GRANTs completos + policies em cada `CREATE TABLE` na mesma migration.

## Detalhes técnicos (para desenvolvedores)

### Migration 1 — Hub (schema)

```text
enums:
  listing_kind = ('offer','demand')
  listing_category = ('credits','panel','dedicated','vps','hosting','cdn',
                     'proxy','domain','cloudflare','service_setup',
                     'service_install','service_migration','service_dns',
                     'service_dev','service_bot','service_site','service_landing',
                     'service_app','partnership','help','other')
  listing_status = ('active','paused','closed','removed')
  verification_status = ('none','pending','approved','rejected')
  report_reason = ('spam','scam','contact_leak','offensive','other')

tables (public.*):
  hub_profiles(id uuid pk = auth.users.id via profiles, handle text unique,
               bio text, location text, verification_status, verified_at,
               verification_doc_path text, business_count int default 0,
               rating_avg numeric(3,2) default 0, rating_count int default 0,
               created_at, updated_at)
  listings(id, author_id, kind, category, title, description, price_cents,
           currency='BRL', location, status='active', flagged bool,
           highlight bool default false, created_at, updated_at)
  conversations(id, listing_id nullable, buyer_id, seller_id,
                last_message_at, buyer_read_at, seller_read_at, created_at)
    unique(listing_id, buyer_id, seller_id) NULLS distinct
  messages(id, conversation_id, sender_id, body text, flagged bool,
           attachments jsonb null, contact_shared bool default false, created_at)
  ratings(id, conversation_id, rater_id, ratee_id, stars 1..5, comment,
          created_at)  unique(conversation_id, rater_id)
  reports(id, reporter_id, target_kind ('listing'|'user'|'message'),
          target_id, reason, detail, resolved_at, created_at)

storage bucket: hub-docs (private, only owner + admin read)
```

Índices em `listings(status, category, created_at desc)`, `messages(conversation_id, created_at)`, `conversations(buyer_id)`, `conversations(seller_id)`.

Cada `CREATE TABLE` seguido por: `GRANT` (authenticated + service_role, sem anon), `ALTER TABLE ... ENABLE RLS`, `CREATE POLICY`.

### Migration 2 — Funções + triggers

- `hub_touch_updated_at` em listings/hub_profiles/conversations.
- `hub_recompute_rating(ratee uuid)` — recalcula `rating_avg`/`rating_count` no `hub_profiles`.
- Trigger `after insert on ratings` → chama `hub_recompute_rating`.
- Trigger `after update on conversations` quando fecha (`closed_at`) → incrementa `business_count` dos dois lados.
- `hub_flag_contact()` — regex simples para telefone/WhatsApp/URL em `messages.body` antes do `contact_shared=true`; seta `flagged=true`.
- `hub_can_participate()` — helper para políticas (assinante ativo + não banido).
- Função `hub_start_conversation(_listing_id uuid)` (security definer) — cria/retorna conversa, garante que autor ≠ interessado.
- Função `hub_get_ranking(_period_days int, _kind text)` — retorna top usuários.

### Arquivos frontend/backend novos

```
src/routes/_authenticated/app.hub.tsx           (layout com <Outlet/> + tabs)
src/routes/_authenticated/app.hub.index.tsx     (Vitrine)
src/routes/_authenticated/app.hub.demand.tsx    (Preciso de Ajuda)
src/routes/_authenticated/app.hub.services.tsx
src/routes/_authenticated/app.hub.ranking.tsx
src/routes/_authenticated/app.hub.new.tsx
src/routes/_authenticated/app.hub.l.$id.tsx
src/routes/_authenticated/app.hub.messages.tsx
src/routes/_authenticated/app.hub.u.$handle.tsx
src/routes/_authenticated/app.hub.verification.tsx
src/components/hub/listing-card.tsx
src/components/hub/reputation-badges.tsx
src/components/hub/chat-panel.tsx
src/components/hub/interest-button.tsx
src/lib/hub.functions.ts       (createServerFn: create/report/verify/upload)
src/lib/hub.server.ts          (helpers de moderação, notificações telegram)
```

Aba "Hub" adicionada ao `AppShell` (ícone Store) e ao Admin.

Realtime: canais `messages:conversation_id=eq.<id>` no chat, `conversations:seller_id=eq.<uid>` na inbox (badge de não-lidas).

### Verificações antes de finalizar

- Build limpo (tsgo).
- Criar 2 usuários assinantes de teste → um anuncia, outro clica "Tenho interesse" → conversa criada → chat trocando mensagens em tempo real → avaliação registra e recalcula média.
- Denúncia entra na fila do admin. Envio de documento aparece na fila do admin. Aprovação seta badge verde.
- Usuário expirado é bloqueado pelo `GatedOutlet` (já existe).
- RLS: usuário A não vê conversa/mensagem/documento de B.
- Regex de contato marca `flagged` em mensagens com telefone/URL antes do "Compartilhar contato".

## Ordem de execução

1. **Migration 1 (schema + policies + grants)** — precisa da sua aprovação.
2. **Migration 2 (funções/triggers)** — depende da 1.
3. Bucket de storage `hub-docs`.
4. Backend (`hub.functions.ts`, `hub.server.ts`).
5. Rotas + componentes.
6. Entrada no menu, integração com Telegram admin.
7. Testes end-to-end e ajustes de UI mobile.

Confirme para eu criar a migration 1 (que já contém tabelas + RLS + grants).
