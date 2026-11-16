# Stream Monitor — Auditoria de rastreamento, cadastro e campanha Leads

**Data:** 16/11/2026 (Brasil). **Ambiente:** site de produção, Lovable Cloud e banco PostgreSQL; anúncios Meta conectados via Windsor.ai.  
**Princípio:** nenhuma campanha, orçamento, ad set ou ad foi criado, reativado, pausado ou excluído neste trabalho.

## Correções técnicas implementadas e publicadas no repositório

1. Consentimento explícito para publicidade no Brasil, banner não bloqueante, Meta Pixel e identificadores só com autorização; revogação apaga dados locais de clique; eventos Lovable Ads de signup também obedecem à autorização.
2. `CompleteRegistration` usa ID retornado após sucesso HTTP 201 da criação no servidor, rejeita Auth duplicate obfuscated identity, e valida existência do perfil.
3. Falhas GoTrue `Password is known to be weak...` passam a explicar senha comprometida, evitando erro genérico; página mobile mostra orientação para navegador interno IG/FB e Turnstile.
4. `Purchase` consulta pagamento de assinatura no servidor autenticado com status `approved`, moeda BRL, valor positivo e `paid_at`; exclui Pix pendente, loja e créditos. Dedup por identificador de pagamento.
5. Primeira origem consentida, UTMs, identificação de campanha/anúncio, click ID quando autorizado, registro de data do cadastro; fbclid isolado e referências sociais orgânicas não são mídia paga.
6. Tabelas privadas com RLS: `customer_acquisition`, `ad_spend_daily` e `acquisition_page_events`. Dados históricos de perfis não foram retroativamente classificados.
7. Admin `/app/admin` → aba **Aquisição de Clientes**: visitas consentidas ao cadastro, registros concluídos, clientes pagos, valor faturado, custo por registro/pagante, Instagram/Facebook e campanhas. O gasto Meta é fotografia da última importação, não dado financeiro em tempo real.
8. Seis linhas de gasto Meta obtidas pelo conector e importadas da campanha antiga, 14–16/11: total armazenado R$15,68, 77 cliques no link e 18 visualizações de página de destino, arredondamento por plataforma/dia. Isso não significa 77 usuários únicos.

## Testes realizados, sem cadastros ou pagamentos inventados

- Cloudflare Browser Run Playwright mobile 390×844: `/auth?tab=signup` renderizado com formulário e banner de publicidade.
- Antes do consentimento: `window.fbq` indefinido e nenhum script `fbevents.js`.
- Após recusar publicidade, limpar cookies e recarregar: formulário acessível, orientação Instagram em user-agent simulado, Pixel não carregado.
- Após aceitar: `fbevents.js` e configuração do Pixel `2289395685308884` carregadas com HTTP 200; `window.fbq` inicializado e o Pixel registrado.
- **LIMITAÇÃO CRÍTICA:** em testes com Cloudflare Browser Run, não foi observada uma requisição `facebook.com/tr` para PageView, mesmo com evento manual depois da aceitação. Isso não prova que navegadores reais falham (o ambiente automatizado pode bloquear rastreadores), mas **não valida o recebimento do evento pela Meta**.
- UTMs consentidos Instagram com meio `paid_social`, ID de campanha/ad set/anúncio e fbclid preservaram primeira origem `meta_ads` entre a landing page e `/auth?tab=signup`. **Duas impressões de teste com ID exclusivo `test_utm_20261116_chatgpt` foram removidas** após o teste.
- A tabela registrou impressões de formulário do navegador de QA; nenhuma conta foi criada. Não foi feito teste completo de cadastro real e pagamento real pelo usuário.
- Confirmação de eventos `PageView`, `CompleteRegistration`, `Purchase` no **Meta Events Manager** ainda **PENDENTE**: a conexão disponível fornece Ads Insights mas não o painel Test Events do Pixel.

## Cadastro: causa dos erros

`signup_attempts` registrou rejeições por senha marcada como fraca/vazada pelo provedor Supabase Auth, inclusive duas de navegadores com user-agent Instagram. A orientação e resposta HTTP estão corrigidas; um fluxo de cadastro novo end-to-end dentro do aplicativo móvel precisa de confirmação em dispositivo real e Turnstile. A recusa de cookies de publicidade não impede carregar os campos; a criação da conta não foi efetuada durante a auditoria para evitar contas de teste não autorizadas.

## Situação Meta Ads

- Pixel ID `2289395685308884` configurado no código, script e config carregados após consentimento; **recepção de eventos não confirmada**.
- No período 14–16/11, o relatório da campanha antiga indicava 0 eventos `CompleteRegistration` e `Purchase` atribuídos. Isso não equivale a ausência de registros reais no banco.
- Em consulta posterior, ad e adset da campanha original apareceram **ARCHIVED**, enquanto metadados de status/objetivo da campanha vieram nulos. Não é possível afirmar status corrente do orçamento ou gasto sem confirmar no Gerenciador de Anúncios.
- Meta docs oferecem `OUTCOME_LEADS` + Website + `OFFSITE_CONVERSIONS` + `pixel_id`/`COMPLETE_REGISTRATION`. Rascunho comercial e storyboard de 24s: [meta-leads-revendedores-2026-11-16.md](./meta-leads-revendedores-2026-11-16.md).
- Nenhuma segunda campanha foi criada; vídeo real ainda não foi cortado/exportado para MP4 porque só existe o asset Meta ID, sem cópia editável confirmada.

## Aprovações e validações pendentes

1. Confirmar `PageView` pelo Meta Events Manager → Pixel `2289395685308884` → Testar Eventos com navegação em dispositivo real e consentimento.
2. Fazer um cadastro novo legítimo com autorização de marketing, confirmar apenas uma recepção `CompleteRegistration`; repetir sem consentimento e confirmar funcionamento do cadastro **sem evento de anúncio**.
3. Confirmar `Purchase` de uma assinatura realmente `approved` (ou ambiente homologado) — o código não considera cobrança Pix pendente.
4. Confirmar login e confirmação e-mail no app do Facebook/Instagram, Safari e Chrome, com anúncios recusados e aceitos.
5. Conferir propriedade e disponibilidade do Pixel, permissão do domínio, interesse e meta de otimização no Meta.
6. Só então criar campanha **PAUSED** dentro da conta e apresentar orçamento/substituição do experimento de Tráfego, sem ativá-la ou alterar R$30 até aprovação expressa.
7. Verificar o vídeo fonte e editar versão final 15–30s em 9:16/4:5. Não usar filmes/canais/listas ou conteúdo protegido.

## Como acompanhar

No site: painel **Administração → Aquisição de Clientes**, com origem, campanha, cadastro, assinatura e receita de pagamentos confirmados. Dados anteriores sem evidência permanecem "sem atribuição". O custo por assinante só é calculável quando existirem pagantes identificados; custo Meta importado é amostra de 14–16/11, não fluxo contínuo.

