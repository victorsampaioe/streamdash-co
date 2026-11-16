# Stream Monitor — RASCUNHO INTERNO Meta Ads / Leads (16/11/2026)

## Atualização Meta Ads — 16/11/2026

- **Campanha real criada PAUSADA na conta Meta Ads `1813033566413744`: `120251923483840158`.**
- Nome: `Stream Monitor | CADASTROS SITE | Revendedores IPTV | Nov 2026 | RASCUNHO`.
- Objetivo enviado e aceito pela API Meta: `OUTCOME_LEADS`.
- Campanha sem orçamento de campanha; `is_adset_budget_sharing_enabled=false`.
- Criação do conjunto de anúncios `OFFSITE_CONVERSIONS` / `WEBSITE`, Pixel `2289395685308884`, evento `COMPLETE_REGISTRATION` **não concluída**: a Meta exige orçamento diário ou vitalício no conjunto, inclusive quando pausado (erro 1487061). Nenhum valor financeiro foi atribuído sem aprovação.
- **Não existe anúncio novo criado** nem nova entrega. O anúncio anterior e conjunto anteriores constam arquivados no conector. O vídeo já existente na conta Meta é o asset `2622906684900533` do próprio Stream Monitor.
- Para completar: obter autorização expressa do novo orçamento TOTAL e prazo (não confundir total com orçamento diário); criar conjunto e ad `SIGN_UP` pausados; confirmar Pixel no Events Manager e aprovar ativação separadamente.
- Este documento registra as ações reais. O texto abaixo ainda é a proposta para o conjunto e criativo que não puderam ser criados por falta de orçamento aprovado.

> **NÃO PUBLICAR / NÃO ATIVAR / NÃO ALTERAR ORÇAMENTO.**
> Este documento é preparação técnica/comercial, **não** é campanha criada no Meta Ads.
> Pré-condições: comprovar PageView, CompleteRegistration e Purchase no Meta Events Manager, testar cadastro consentido em navegador comum e interno, conferir domínio e dados de pixel, apresentar orçamento/substituição ao titular e obter aprovação financeira expressa.

## Motivo do novo teste

Objetivo primário: cadastros de **revendedores, gestores de painéis IPTV e profissionais de infraestrutura** que depois assinem o Stream Monitor. Métrica principal **custo por assinante pagante (CAC)**, secundárias custo por cadastro e taxa de conversão cadastro→assinatura. Nunca divulgar comercialização de listas, canais ou conteúdo protegido.

A campanha de Tráfego atual `120251902436720158` tem **limite total R$30**. Preservá-lo integralmente. **Não criar um segundo gasto simultâneo, nem duplicar R$30, sem autorização**. O orçamento remanescente no Meta pode mudar; conferir antes de sugerir substituição. A proposta é ativar Leads só após pausar/encerrar Tráfego, com orçamento próprio explicitamente aprovado. NÃO transferir o orçamento da campanha antiga por suposição.

## Especificação Meta planejada, não enviada

- Conta: `1813033566413744`, Brasil, idioma português, Facebook e Instagram.
- Campanha: `Stream Monitor | Leads Site | Revendedores Brasil | Preparação`.
- Objective: `OUTCOME_LEADS`, status planejado **PAUSED**, special ad categories nenhuma, sujeito a validação Meta.
- Conversion location: **Website**.
- Ad set optimization goal: `OFFSITE_CONVERSIONS` se disponível para a conta; não iniciar no escuro.
- Promoted object esperado: `{"pixel_id":"2289395685308884","custom_event_type":"COMPLETE_REGISTRATION"}`. Associar conjunto ao domínio `streammonitor.site`; verificar permissão sobre o Pixel e evento no Events Manager antes da criação.
- Destino do anúncio: `https://streammonitor.site/auth?tab=signup`. Testar em Safari, Chrome, navegador Instagram/Facebook, com cookies de publicidade recusados e aceitos.
- Público: profissionais de revenda/painéis de IPTV, DNS, redes, hospedagem, monitoramento de servidores. **IDs usados no conjunto atual** (não presumir que todos continuem disponíveis ao criar novo): IPTV `6003273276043`, Servidores (computação) `6003151951349`, Servidor web `6003274117508`, Hospedagem web `6003387418453`. **Design gráfico não será prioridade**, para evitar tráfego interessado em artes sem monitoramento. Testar audiência ampla profissional vs interesses restritos somente quando houver dados; nenhum grupo recebe orçamento neste rascunho.
- Criativos em 9:16 (Stories/Reels) e 4:5 (Feed) após edição/crop de vídeo real da plataforma. Não usar imagens de conteúdo protegido.
- CTA: `SIGN_UP` / **Cadastre-se**.
- URL tags sugeridas (confirmar substituições dinâmicas antes de ativar):
  `utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign=streammonitor_leads_dns&utm_campaign_id={{campaign.id}}&utm_adset_id={{adset.id}}&utm_ad_id={{ad.id}}&utm_content={{ad.name}}`.
  No servidor, UTM + meio pago são evidência de campanha; `fbclid` isolado nunca prova mídia paga.

## Texto principal

> Você trabalha com revenda de IPTV?
>
> Monitore a disponibilidade dos seus servidores e DNS, identifique falhas e receba alertas no Telegram quando um problema for confirmado.
>
> Conheça o Stream Monitor e tenha mais visibilidade sobre sua operação.

Título: **Monitore seus servidores IPTV**  
Descrição: **Crie sua conta no Stream Monitor.**  
Botão: **Cadastre-se**.

Evitar: promessas de 100% de detecção, antecipação garantida de todos os clientes, comércio de canais, listas ou transmissão de terceiros.

## Roteiro de vídeo — 20–25 segundos (somente storyboard, arquivo não exportado)

Reutilizar o vídeo verdadeiro do painel já existente na Meta (asset informado em histórico: `2622906684900533`). **Duração e disponibilidade de download não verificadas nesta etapa**.

| Tempo | Tela/cena real sugerida | Sobreposição curta |
|---|---|---|
| 0–4s | Painel mostrando lista de DNS/servidores | **Revende IPTV?** |
| 4–9s | Checagem DNS / HTTP / latência | **Monitore seus servidores** |
| 9–14s | Alertas e estados de queda/retorno | **Alertas no Telegram** |
| 14–19s | Dashboard do Stream Monitor | **Identifique instabilidades** |
| 19–24s | Logo, interface e CTA | **Crie sua conta em streammonitor.site** |

Formato: arquivo MP4 real, áudio de direitos liberados ou sem trilha; legendas legíveis e área segura de Reels/Stories; cortes adaptados para 9:16/4:5. **Não confundir roteiro com vídeo já renderizado**.

## Validação de conversão obrigatória

1. Abrir Meta Events Manager → Pixel `2289395685308884` → **Testar eventos**.
2. Acessar `streammonitor.site` sem consentimento: nenhuma requisição Meta Pixel. Conceder consentimento: `PageView` recebido exatamente uma vez por visita elegível.
3. Abrir `/auth?tab=signup` no navegador interno do Instagram e em Chrome/Safari, com consentimento recusado: cadastro deve continuar possível (não criar conversão Meta).
4. Fazer **um cadastro de teste realmente novo com consentimento** e conferir `CompleteRegistration` recebido uma única vez, ID de evento vinculado ao usuário confirmado.
5. Concluir **um pagamento legítimo de assinatura** (ou teste controlado com ambiente homologado) e confirmar `Purchase` com valor correto e apenas depois de `approved`; PIX pending e créditos não disparam.
6. Conferir painel **Administração → Aquisição de Clientes** e linhas de pagamento aprovado. Testar sem cookie de publicidade; o cliente deve aparecer como sem atribuição, não convertido artificialmente em Facebook/Instagram.
7. Testar redirecionamento do anúncio com UTMs e `fbclid`, sem inferir “pago” com `fbclid` isolado. Verificar política LGPD, deduplicação e recusa.
8. Somente após confirmação real de `CompleteRegistration` e permissões do Pixel, criar a campanha **PAUSED**, apresentar ao titular o orçamento/horário/substituição; **nenhuma ativação sem aprovação expressa**.

## Limitações operacionais

A Meta pode ter poucos eventos semanais: aprendizagem com conversões de site pode ser limitada ou instável. No teste de tráfego anterior, a ferramenta de relatórios retornou **77 cliques de link, 18 visualizações reais de destino e 0 eventos de cadastro/pagamento atribuídos** para 14–16/11; não confundir zero na campanha com zero cadastros reais. Windsor.ai não expõe aqui a aba **Testar Eventos do Pixel**; verificação efetiva de recebimento permanece pendente. Custos importados são fotografia de dados, não sincronização contínua.

## Gate financeiro

**Bloqueado:** criar campanha Leads com orçamento próprio, pausar Tráfego, aumentar R$30, ativar novos ads, iniciar cobrança ou manter duas campanhas simultâneas. Aguardar aprovação específica.

