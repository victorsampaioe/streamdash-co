# Plano: Sincronização e Busca Manual no Radar IPTV

O objetivo deste plano é implementar uma função de busca/teste manual no Radar IPTV para o Admin, permitindo validar a presença de conteúdos específicos (ex: "The Dark (2026)") nos servidores monitorados, sem interferir na sincronização automática global.

## Alterações Propostas

### 1. Backend: Lógica de Busca Manual
- Criar a função `searchRadarTitleManual` em `src/lib/radar-admin.functions.ts`.
- Esta função irá:
    1. Receber um título e tipo de mídia (opcional).
    2. Identificar todos os servidores com credenciais IPTV ativas.
    3. Executar uma busca rápida (login + VOD/Séries) em cada servidor.
    4. Tentar localizar o título exato ou aproximado usando a lógica de `titleKey`.
    5. Se encontrado, criar ou atualizar o vínculo na tabela `iptv_catalog_matches`.
    6. Retornar um resumo detalhado: título encontrado (sim/não), quantidade de servidores, nomes dos servidores e data da última verificação.

### 2. Frontend: Interface de Teste Manual
- Adicionar uma nova seção "Teste Manual de Busca" no `RadarAdminPanel` (em `src/components/admin/radar-admin-panel.tsx`).
- Incluir:
    - Campo de input para o título.
    - Botão "Executar Busca Diagnóstica".
    - Área de resultados exibindo o JSON ou cards com as informações retornadas pelo backend.

## Detalhes Técnicos
- Utilizar `createServerFn` com `requireSupabaseAuth` e validação de role admin.
- A busca será limitada aos servidores elegíveis para evitar sobrecarga.
- O resultado será puramente informativo para o admin, mas os vínculos encontrados serão persistidos para manter o Radar atualizado.

---
**Nota:** O texto solicitado pelo usuário não foi encontrado no código atual, indicando que se trata de uma nova funcionalidade descrita na solicitação. O plano acima formaliza a implementação desta funcionalidade.
