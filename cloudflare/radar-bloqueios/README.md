# Stream Monitor — Radar de Bloqueios (implantação privada)

## Estado atual

A arquitetura Cloudflare foi preparada em modo **piloto interno**. NÃO está liberada para revendedores.

- Worker: \`streammonitor-radar-bloqueios\` (somente Cron, acesso HTTP público desabilitado).
- Bancos: reaproveita o D1 DNS existente (\`radar_states\`, \`radar_evidence\`, \`radar_transitions\`, \`radar_outbox\`, \`radar_sources\`, \`radar_runs\`, \`radar_control\`) e o D1 de metadados de migração.
- Fontes consultadas: nenhuma no piloto — o provedor escolhido requer autorização. A fonte 01 está cadastrada como NÃO aprovada e DESABILITADA. Endpoint real e origem permanecem na trilha de auditoria privada, nunca na UI, API pública ou Telegram.
- Conector privado: \`private-source-adapter.mjs\`, já vinculado ao Worker com bloqueio explícito. A base externa é consultada somente após aprovações independentes na configuração e no D1. Utiliza versionamento e compara domínios apenas localmente; nenhuma DNS de cliente é enviada ao provedor.
- UI Sentinel Edge: \`src/components/radar/radar-bloqueios-dashboard.tsx\`, componente puro sem chamadas a fontes ou Supabase. Exige um snapshot previamente autorizado, com identidade e posse do servidor verificadas. Não conectá-lo diretamente a dados globais.
- As rotas dos revendedores e as notificações estão **DESABILITADAS**. Cloudflare Access não está habilitado nesta conta; antes de liberar será necessário implementar e testar uma proteção administrativa e multitenant independente.
- Uso de Cloudflare Queue: fila de envio preexistente continua sem receber eventos do Radar. As transições são gravadas em \`radar_outbox\` como \`held\`; não conectar mensagens ao Telegram antes dos testes de permissão, deduplicação e volume.

## Regras técnicas de evidência

- Um servidor offline, erro HTTP ou DNS negativo isolado NUNCA confirma bloqueio.
- Status \`normal\`: resultados recentes positivos de DNS e HTTP nas redes verificadas; não significa disponibilidade global.
- \`possible\`: divergência técnica repetida; não confundir com certeza.
- \`confirmed\`: no mínimo duas fontes verificadas, duas redes distintas com indicadores de restrição, um comparativo de rede acessível e observações separadas por cinco minutos. Se não houver essa evidência, permanecer inconclusivo.
- \`risk\`: registro FUTURO verificado com data real, nunca data inventada.
- \`normalized\`: somente para casos confirmados anteriormente, com acesso recente e evidência de recuperação em ao menos duas redes distintas.
- Falta de prova, dados atrasados, endpoint sem autorização ou indisponibilidade comum: \`unknown\`.
- Dados não identificados do fornecedor somente em auditoria privada.

## Segurança e limites

- Não transferir usuários/senhas Xtream ou listas privadas para fornecedores de inteligência.
- Nunca copiar tokens ou cookies para o repositório ou para o frontend.
- Sem endpoint público que aceite \`ownerId\` arbitrário. A API futura deverá inferir o dono a partir de JWT verificado na Cloudflare, executar consultas \`WHERE owner_id=?\` e checar autorização do revendedor ao \`server_id\`.
- Lógica de disponibilidade existente não é modificada.
- Cron de classificação e Cron de ingestão são independentes. Ingestão permanece desativada sem credenciais/uso legítimo autorizado.
- Os relatórios do Radar não substituem o histórico original de checagens.
- O D1 mantém apenas metadados/evidências necessárias; transições são conservadas para rastreabilidade.
- Controle fail-closed: \`reseller_access_enabled=false\`, \`telegram_dispatch_enabled=false\`, \`feed_ingestion_enabled=false\`.

## Antes de habilitar

1. Obter autorização válida para acesso à API restrita e configurar base/host/chave como Secrets na Cloudflare; auditar titularidade e termos. Não contornar autenticação, limitação de IP ou outras restrições.
2. Conferir a execução do Cron e ausência de erros por múltiplos ciclos; comparar contagens e classificações com os dados D1 reais.
3. Migrar de forma segura a autenticação/posse dos servidores para a Cloudflare; a tabela de propriedade atual é uma cópia de preparação e pode ficar desatualizada.
4. Ativar Access ou solução equivalente; testar isolamento, rate limits, admin, RLS, sem vazamento de fontes.
5. Testar novas informações da fonte, casos futuros, divergências de rede, falso positivo, normalização, alertas duplicados e limites da fila.
6. Conectar a UI e notificações somente após testes. Monitorar custos e abortar a liberação em caso de falha.

Os nomes, links e documentos das fontes **não são informações para clientes**, mas os dados reais de proveniência devem ser mantidos em auditoria protegida para validação e conformidade.
