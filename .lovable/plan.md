# Plano de Implementação: Diagnóstico de Conteúdo IPTV

Implementar um sistema de diagnóstico técnico profundo para fluxos IPTV (Live, VOD, Séries), integrado ao Radar de Conteúdo, permitindo identificar se falhas são no servidor ou no cliente, com proteções de concorrência e circuit breaker.

## 1. Infraestrutura de Dados (Concluído)
- Criadas tabelas `content_diagnostics` para histórico e `diagnostic_circuit_breakers` para proteção de servidores.
- Implementadas funções SQL (`record_diagnostic_failure/success`) com lógica de circuit breaker (5 falhas = suspensão de 3 min).

## 2. Motor de Diagnóstico (Backend)
- Criado `src/lib/diagnostics.server.ts`:
  - Execução progressiva em 9 etapas (Servidor -> API -> Stream -> Mídia -> Classificação).
  - Limites rígidos: 512KB máx de leitura, timeout de 15s.
  - Suporte a cabeçalho `Range` para economia de banda.
  - Lógica de **Single-Flight** para deduplicar diagnósticos simultâneos idênticos.
- Criado `src/lib/diagnostics.functions.ts`:
  - Integração com o **Core AWS** (`runOnCore`) para medição de latência real.
  - Middlewares de assinatura ativa e rate limiting.

## 3. Interface de Usuário (Frontend)
- Criado `src/components/iptv/diagnostic-dialog.tsx`:
  - Stepper progressivo atualizado em tempo real.
  - Classificação visual (Ícones/Cores) do resultado.
  - Exibição de métricas técnicas (TTFB, Latência, Bytes).
- Integrado na página de detalhes do título (`app/inteligencia//.tsx`):
  - Botão "Testar agora" (ícone de Activity) na lista de servidores disponíveis.

## 4. Painel Administrativo
- Criado `src/components/admin/circuit-breaker-panel.tsx`:
  - Visão geral dos servidores em modo `open` (suspenso) ou `half-open`.
  - Contadores de falhas e cronômetro para o próximo teste permitido.
- Adicionada aba **Diagnósticos** em `app.admin.tsx`.

## Próximos Passos
- Validar a execução na VPS AWS (Core).
- Refinar a inferência "Provável problema do cliente" comparando resultados de múltiplos servidores.
