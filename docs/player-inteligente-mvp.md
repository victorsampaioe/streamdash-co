# Novo Módulo: Player Inteligente (Web Player do Stream Monitor)

## Objetivo
Criar uma área dentro do Stream Monitor que permita aos revendedores oferecerem um Web Player próprio para seus clientes assistirem TV ao vivo, filmes e séries, usando a infraestrutura IPTV (servidores Xtream) já cadastrada no sistema.

**Restrição fundamental: não criar um sistema separado.** Este módulo deve reutilizar 100% da arquitetura existente — usuários, revendedores, planos/créditos, servidores cadastrados, integração Xtream Codes, Inteligência de Conteúdo (Radar de Conteúdo), banco de dados e Core/API atuais. Nenhuma funcionalidade existente do Stream Monitor pode ser alterada ou quebrada.

---

## ⚠️ Ponto técnico crítico — ler antes de implementar

Antes de qualquer código, é preciso resolver como o navegador vai reproduzir os streams:

- Painéis Xtream normalmente entregam **canais ao vivo em MPEG-TS bruto** (`.ts` via HTTP), formato que **não toca nativamente em navegador**. Para funcionar no Web Player, o sistema precisa de um **proxy de remux para HLS (`.m3u8`)** rodando no backend (ex: via ffmpeg), convertendo o stream em tempo real.
- Muitos painéis também bloqueiam requisição direta do navegador por **CORS**. O player não pode chamar a URL do Xtream diretamente do cliente — precisa passar por um endpoint próprio do Core/API que funcione como proxy.
- **Filmes e séries (VOD)** costumam ser mais simples (arquivo único, formatos já compatíveis com HTML5/hls.js) — recomendo implementar e validar VOD primeiro, e só depois avaliar o esforço de transcodificação para o **ao vivo**.
- Isso tem impacto direto de **custo de infraestrutura** (banda + processamento de transcodificação), diferente do Diagnóstico de Conteúdo, que só faz checagens rápidas. Vale confirmar com o Lovable/infra qual é o plano de hospedagem antes de assumir compromisso com clientes finais.

**Peço que essa etapa (proxy/remux) seja avaliada e resolvida logo no início do MVP — sem isso, o restante do módulo não funciona de fato.**

---

## Estrutura de rotas

| Rota | Descrição |
|---|---|
| `/player` | Área pública do Web Player (acesso do cliente final) |
| `/app/player` | Área administrativa (configuração pelo revendedor/admin) |

---

## Autenticação do cliente (login Xtream)

Formulário de entrada:
- Usuário Xtream
- Senha Xtream
- URL do servidor

Após login bem-sucedido:
- Criar sessão segura (token com expiração)
- Registrar e controlar:
  - Validade da conta (expiração vinda do Xtream)
  - Limite de conexões simultâneas
  - Último acesso
  - Dispositivo utilizado
  - Histórico de sessões

---

## Interface do Web Player

Menu principal:
- 📺 TV Ao Vivo
- 🎬 Filmes
- 🍿 Séries
- ⭐ Favoritos
- 🔎 Pesquisa
- ⚙️ Configurações

### TV Ao Vivo
Exibir: categorias, lista de canais, logo, nome, status (online/offline), favoritos.
Recursos: player HTML5 (via HLS.js consumindo o proxy), tela cheia, controle de volume, troca rápida entre canais, últimos canais assistidos.

### Filmes
Exibir: capa, nome, categoria, ano, descrição, duração.
Funções: assistir, adicionar aos favoritos, continuar assistindo, histórico.

### Séries
Exibir: capa, nome, temporadas, episódios, último episódio assistido.

---

## Integração com Inteligência de Conteúdo (Radar de Conteúdo)

Ao pesquisar um filme ou série, mostrar em quais servidores o conteúdo foi encontrado e o status de cada um, reaproveitando os dados já coletados pelo Radar/Diagnóstico:

```
"Homem-Aranha"
Encontrado em:
  Servidor A 🟢
  Servidor B 🟢
  Servidor C 🟡
```

Informações exibidas: quantidade de servidores disponíveis, melhor servidor, saúde do servidor, latência, disponibilidade atual.

## Escolha inteligente de servidor

Antes de iniciar a reprodução, verificar (usando os dados já existentes do Health Score/Circuit Breaker):
1. Servidor está online
2. Menor latência
3. Melhor Health Score
4. Menor instabilidade/histórico de falhas

Selecionar automaticamente o melhor servidor com base nesses critérios, na ordem de prioridade acima.

---

## Área do revendedor (personalização do player)

Cada revendedor pode configurar seu próprio player (white-label):
- Nome da marca
- Logo
- Favicon
- Cor principal
- Banner
- Domínio personalizado (ex: `player.revenda.com`) — **marcar como fase futura**, fora do MVP

---

## Painel Admin

### Players ativos
Exibir: revendedor, quantidade de clientes, último acesso, consumo (banda/uso).

### Clientes conectados
Exibir: usuário, dispositivo, IP, horário, conteúdo assistido.

---

## Segurança

- Sessão segura com expiração automática
- Controle de acesso por papel (cliente/revendedor/admin), seguindo o mesmo padrão de RLS já usado no restante do sistema
- Rate limit nas rotas de login e reprodução (reaproveitar a lógica de rate limit já validada no Diagnóstico de Conteúdo)
- Proteção contra abuso (ex: múltiplas sessões simultâneas além do limite de conexões da conta)
- Logs de acesso
- **O sistema não armazena arquivos de vídeo em nenhum momento** — apenas gerencia e faz proxy da reprodução a partir das fontes já cadastradas

---

## Performance

- Cache do catálogo (categorias, listas de canais/filmes/séries) para evitar reconsultar o Xtream a cada acesso
- Paginação nas listagens
- Lazy loading das capas/imagens
- Otimização para mobile

Compatibilidade: celular, computador, tablet e Smart TV com navegador.

---

## Banco de dados

Criar as seguintes tabelas, seguindo o padrão atual do banco e **aplicando RLS corretamente em todas elas desde a criação** (dado o histórico recente de itens de segurança encontrados no projeto, não deixar nenhuma tabela nova sem RLS):

- `player_settings` — configurações de personalização por revendedor
- `player_sessions` — sessões ativas dos clientes (com expiração, dispositivo, IP)
- `player_history` — histórico de conteúdo assistido / continuar assistindo
- `player_favorites` — favoritos do cliente
- `player_devices` — dispositivos vinculados à conta
- `player_access_logs` — logs de acesso para auditoria

Cada tabela deve ter policy restringindo o acesso ao próprio dono do dado (cliente) ou ao revendedor/admin responsável, nunca acesso público irrestrito.

---

## Fase inicial — MVP

Implementar primeiro, nesta ordem:
1. Proxy/remux para reprodução funcionar no navegador (pré-requisito técnico, ver seção crítica acima)
2. Login Xtream
3. Lista de canais (TV ao vivo)
4. Filmes
5. Séries
6. Reprodução básica
7. Pesquisa
8. Favoritos
9. Integração com servidores existentes

### Depois evoluir para:
- Escolha inteligente de servidor (Health Score/latência)
- Personalização por revendedor (white-label)
- Domínio próprio
- Analytics

### Antes de considerar o MVP finalizado, testar:
- Login
- Carregamento de catálogo
- Reprodução (ao vivo e VOD)
- Erros de servidor (offline, timeout)
- Contas expiradas
- Permissões por papel (cliente/revendedor/admin)

---

## Regra geral
Módulo deve ser construído de forma integrada à base de código atual, escalável, e **sem alterar nenhuma funcionalidade já existente do Stream Monitor** (Radar de Conteúdo, Diagnóstico de Conteúdo, Admin, Reativação, etc.).
