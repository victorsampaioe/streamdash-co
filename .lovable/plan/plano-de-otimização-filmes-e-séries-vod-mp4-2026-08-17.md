# Plano de Otimização: Filmes e Séries (VOD MP4)

Este plano descreve as melhorias necessárias para garantir que conteúdos VOD (filmes e séries) em formato MP4, especialmente os mais antigos ou com configurações específicas de servidor, sejam reproduzidos com a mesma estabilidade dos lançamentos recentes.

## 1. Melhoria do Proxy VOD no Core
Otimizar o motor de processamento no Core AWS para lidar com a natureza fragmentada das requisições de vídeo MP4.

- **Suporte a Range Requests (206)**: Garantir o encaminhamento correto dos headers `Accept-Ranges: bytes`, `Content-Range`, `Content-Length` e `Content-Type: video/mp4`.
- **Múltiplas Requisições**: Suportar o fluxo de requisições sequenciais do navegador (ex: bytes=0-1023, depois bytes=1024-...).
- **Estabilidade e Timeout**: Aumentar os timeouts para arquivos grandes e manter a conexão aberta durante reproduções longas, evitando fechamentos prematuros do stream.

## 2. Diagnóstico Interno de VOD (Admin)
Centralizar as métricas técnicas para facilitar a identificação de padrões de falha entre diferentes conteúdos.

- **[VOD] Detalhes Técnicos**: Exibir no painel admin (ou logs de execução):
  - Tipo (Filme/Série), Arquivo e Servidor de Origem.
  - Tamanho real, Status HTTP e Range solicitado.
  - Tempo para o primeiro byte (TTFB) e tempo de início da reprodução.
- **Comparativo de Saúde**: Ferramenta para comparar conteúdos que funcionam (🟢) vs falhas (🔴) para isolar problemas de infraestrutura ou codec.

## 3. Detecção de Compatibilidade e Erros
Identificar automaticamente o motivo da falha antes que o usuário veja uma tela preta.

- **Análise Automática**: Verificar codecs de vídeo/áudio, presença do `moov atom` (Fast Start) no fim do arquivo, arquivos corrompidos ou bloqueios de servidor (403/404).
- **Categorização de Erros**:
  - 🔴 **Offline**: Conteúdo inexistente na origem.
  - 🟡 **Bloqueado**: Servidor de origem impedindo o proxy.
  - 🟠 **Incompatível**: Formato ou codec não suportado pelo navegador atual.

## 4. Otimização de Séries
Ajustar o carregamento para ser tão eficiente quanto o de filmes.

- **Carga sob Demanda**: Carregar apenas os metadados do episódio escolhido, sem processar a temporada inteira desnecessariamente.
- **Pipeline Unificado**: Utilizar o mesmo motor de proxy VOD otimizado para filmes nas séries.
- **Retenção**: Garantir a persistência do histórico do último episódio assistido.

## 5. Fallback Inteligente
Implementar uma escada de tentativas para evitar erros visíveis ao cliente.

1. **Proxy Core Normal**: Primeira tentativa com headers padrão.
2. **Ajuste de Headers**: Segunda tentativa emulando outros players (User-Agents).
3. **Entrega Alternativa**: Mudança de método de transporte se disponível.
4. **Erro Amigável**: Se tudo falhar, exibir mensagem "Este conteúdo está temporariamente indisponível" em vez de logs técnicos.

## Critérios de Sucesso
- ✅ Filmes MP4 de catálogo antigo reproduzindo sem interrupções.
- ✅ Episódios de séries abrindo com o mesmo "Quick Play" dos filmes.
- ✅ Ausência de tela preta infinita; diagnóstico disponível apenas para Admin.
- ✅ Primeiro frame (TTFF) abaixo de 3 segundos em conexões padrão.
