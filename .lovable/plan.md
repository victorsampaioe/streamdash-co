# Cadastro simples, rápido e seguro

## Auditoria concluída

O cadastro atual usa e-mail, senha, nome e telefone; cria automaticamente o perfil, período de teste, indicação e demais vínculos. Login, recuperação, pagamentos, revendedores, API e Stream Play dependem do e-mail da conta.

O principal atrito está na proteção atual: erros de preenchimento e contas já existentes entram no mesmo contador por IP. Com limites de 3 tentativas em 10 minutos e 5 por hora, pessoas em uma rede compartilhada podem bloquear umas às outras. A tela também expõe etapas demais e só valida vários problemas após o envio.

Decisão confirmada: **o e-mail continuará obrigatório**. O nome de usuário será um identificador adicional, exclusivo e sugerido no cadastro rápido. Usuários atuais continuarão entrando normalmente com e-mail e senha.

## O que será construído

### 1. Nova experiência de acesso

- Separar visualmente “Entrar” e “Criar conta”, mantendo a página pública atual.
- Cadastro com: e-mail, nome de usuário, senha e confirmar senha.
- Mostrar/ocultar senha com botão de olho acessível.
- Ação principal “CRIAR MINHA CONTA” e link “Já possui conta? Entrar”.
- Manter Turnstile e honeypot funcionando silenciosamente; o desafio só aparecerá se o provedor exigir interação.
- Preservar indicação recebida por link, sem adicionar campo ou complexidade visual.

### 2. Validação imediata

- Validar e-mail, nome de usuário, força mínima e confirmação enquanto a pessoa digita.
- Consultar disponibilidade de usuário/e-mail com atraso curto para evitar excesso de requisições.
- Não limpar campos após qualquer erro.
- Desabilitar o envio somente enquanto houver erro conhecido ou processamento em andamento.
- Traduzir respostas do serviço de autenticação para mensagens simples e consistentes.

### 3. Cadastro rápido

- Adicionar “Criar acesso rápido”.
- Sugerir um usuário disponível no formato `cliente4821`, com nova sugestão em caso de colisão.
- Gerar senha forte no aparelho e permitir mostrar/copiar antes do envio.
- Após sucesso, exibir usuário e senha mascarada, com ações “Copiar acesso” e “Entrar agora”.
- A senha existirá apenas na tela durante esse momento; nunca será gravada ou registrada em texto puro.

### 4. Compatibilidade com contas atuais

- Adicionar `username` opcional e exclusivo ao perfil; contas existentes não precisam de migração manual.
- Novos cadastros terão e-mail real obrigatório e nome de usuário exclusivo.
- Login aceitará e-mail; quando a pessoa digitar um nome de usuário, a resolução ocorrerá com proteção no servidor, sem expor e-mails.
- Preservar criação automática de perfil, teste gratuito, indicação, pagamentos, assinatura, revendedores, API e Stream Play.
- Manter confirmação automática/login imediato conforme a configuração atual; se uma conta exigir confirmação, mostrar o fluxo de e-mail corretamente em vez de falhar.

### 5. Recuperação sem atrito

- Manter “Esqueci minha senha” em destaque na tela de entrada.
- Quando o e-mail já existir no cadastro, abrir uma escolha: “Entrar” ou “Recuperar senha”.
- Validar o e-mail antes do envio e nunca revelar detalhes técnicos.
- Melhorar a página de nova senha com confirmação e mensagens amigáveis.

### 6. Proteção adaptativa

- Alterar limites normais para até 5 tentativas em 10 minutos e 10 em 1 hora por combinação de IP + identidade.
- Não contar validações locais, cadastros concluídos nem simples erros de preenchimento como ataque.
- Usar contadores separados para identidade e para comportamento agregado do IP.
- Só limitar uma rede inteira quando houver sinais fortes em várias identidades, evitando prejuízo em empresas, provedores móveis e redes compartilhadas.
- Aplicar progressão: novo desafio, espera curta e somente depois bloqueio temporário por comportamento realmente suspeito.
- Honeypot e falhas repetidas do Turnstile continuarão como sinais fortes, sem bloquear uma rede por um único evento.
- Retornar `Retry-After` e mensagens humanas, sem revelar regras internas.

### 7. Painel Proteção de Cadastros

- Separar os indicadores: criado, usuário/e-mail existente, dados inválidos, falha interna, limite atingido, Turnstile e bot/honeypot.
- Transformar cada tentativa em item expansível com motivo técnico, horário, identificadores mascarados e contexto seguro para o administrador.
- Não registrar senha, token do Turnstile ou IP completo.
- Exibir o estado da proteção e permitir remover um bloqueio falso com autorização administrativa.

## Detalhes técnicos

- Migração aditiva no Lovable Cloud: coluna `profiles.username`, índice único normalizado, novos campos de classificação/risco nas tentativas e funções administrativas com RLS e permissões explícitas.
- Endpoint público de disponibilidade com validação, resposta mínima e limite próprio; nunca retornará dados de perfil ou e-mail de terceiros.
- O endpoint de cadastro continuará sendo a única porta de criação, preservando validação no servidor, idempotência e alerta deduplicado.
- Testes unitários para validação, tradução de erros, classificação administrativa e algoritmo de limite.
- Testes de integração para conta nova, duplicidades, correção da confirmação, recuperação, Turnstile e ataques.

## Validação final

- Criar conta normal e entrar automaticamente.
- Errar confirmação da senha, corrigir e manter os demais campos.
- Testar usuário e e-mail existentes com ações de entrada/recuperação.
- Repetir erros comuns sem bloqueio injusto.
- Simular ataque até acionar proteção progressiva.
- Validar Turnstile e honeypot.
- Testar recuperação completa e nova senha.
- Validar em celular de 430 px e desktop, buscando conclusão em menos de 30 segundos.
- Confirmar no banco perfil, assinatura de teste e logs sem dados sensíveis.
