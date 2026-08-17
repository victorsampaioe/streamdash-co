# Plano de Verificação de Produção: Web Player (HLS)

Este plano foca em confirmar se as atualizações recentes do Web Player HLS foram aplicadas corretamente e se não há bloqueios de cache impedindo o funcionamento.

## Cenário Atual
- Antes: O `.m3u8` retornava erro 404 e nada era reproduzido.
- Agora: O carregamento é parcial, o áudio chega, mas o vídeo falha. Isso indica que as mudanças no Core foram aplicadas, mas o frontend pode estar desatualizado ou preso em cache.

## Ações de Verificação

### 1. Integridade do Deploy
- Confirmar se o build atual em produção reflete as últimas alterações de código.
- Verificar a versão do bundle JS carregada pelo navegador para garantir que não é um artefato antigo.

### 2. Gestão de Cache e PWA
- **Invalidação de Cache**: Realizar a limpeza de cache na CDN/Cloudflare após o deploy para garantir a entrega dos novos arquivos.
- **Service Worker / PWA**: Investigar se o Service Worker antigo está mantendo uma versão anterior do Web Player no navegador do usuário.
- **Processo Pós-Deploy**: Estabelecer um fluxo de invalidação automática para evitar que este problema se repita em futuras correções.

### 3. Diagnóstico de Falha de Vídeo
- Validar se o "vídeo falha" é um bug real da nova versão ou apenas consequência de um frontend antigo tentando se comunicar com um Core novo.
- Testar em abas anônimas e diferentes navegadores para isolar o fator cache local.

## Critérios de Sucesso
- Frontend e Core operando na mesma versão sincronizada.
- Reprodução completa (áudio e vídeo) estável no Web Player HLS.
- Ausência de conflitos causados por cache de Service Worker ou CDN.
