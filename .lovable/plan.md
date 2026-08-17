# Plano de Reformulação Premium do Web Player

O objetivo é transformar o Web Player em uma plataforma moderna e leve (estilo Netflix/OTT premium), focando em velocidade, estabilidade e experiência simplificada, sem animações pesadas ou excesso de botões.

## Arquitetura e Performance

- Implementação de **Lazy Loading** em todo o catálogo.
- **Paginação e Infinite Scroll** nas telas de Filmes, Séries e TV Ao Vivo (carregando de 50 em 50).
- **Cache Local** para metadados e categorias.
- **Debounce** na busca inteligente.
- **Abertura Instantânea** do player com diagnóstico assíncrono em segundo plano.

## Design e Interface (Dark Premium)

- Tema ultra-dark com fundo em tons de preto e cinza muito leves.
- Cards com bordas arredondadas e tipografia moderna.
- Remoção de animações de entrada longas, efeitos de blur exagerados e transições pesadas.
- **Sidebar Fixa (Desktop)** e **Menu Inferior (Mobile)** estilo aplicativo.

### Menu Lateral Atualizado
- 🏠 Início
- 📺 TV Ao Vivo
- 🎬 Filmes
- 📺 Séries
- ⭐ Minha Lista
- 🔍 Buscar
- ⚙️ Configurações

## Funcionalidades por Módulo

### Tela Inicial (Home)
- **Banner Principal:** Hero dinâmico com autoplay (quando disponível) e botões "Assistir" e "Minha Lista".
- **Continue Assistindo:** Seção alimentada automaticamente pelo histórico do usuário.
- **Fileiras Dinâmicas:** Lançamentos, Mais Assistidos e Destaques.

### Filmes e Séries
- **Busca Rápida e Filtros:** Ano, Gênero, Qualidade e Servidor.
- **Cards Minimalistas:** Foco em Capa, Título, Ano e Nota.
- **Modal de Detalhes:** Moderno com sinopse, elenco, duração e botão de ação imediata.
- **Organização de Séries:** Seleção de temporadas por abas e lista de episódios com thumbnails e progresso.

### TV Ao Vivo (Guia de TV)
- **Busca Instantânea:** Filtro em tempo real por nome do canal.
- **Categorização:** Esportes, Filmes, Notícias, Infantil, etc.
- **Favoritos:** Sistema de marcação rápida de canais preferidos.

### Busca Inteligente
- Pesquisa unificada (Filmes, Séries, Episódios, Canais).
- Suporte a erros de digitação e termos parciais.
- Resultados separados por categoria.

### Player Premium
- Interface limpa com controles de volume, tela cheia, qualidade, legendas, áudio e velocidade.
- **Tratamento de Erros:** Mensagens amigáveis e tentativas automáticas de reconexão.
- **Diagnóstico Silencioso:** Integração com o monitoramento para exibir o status da conexão (Verde/Amarelo/Vermelho) apenas se necessário.

## Detalhes Técnicos

- **Frontend:** Refatoração de `src/routes/player.$resellerId.tsx` e componentes em `src/components/player/`.
- **Backend:** Manutenção da integração com o Core AWS para proxy de stream e diagnóstico.
- **White Label:** Preservação da personalização de logos, cores e subdomínios por revenda.
- **Compatibilidade:** Suporte total a Desktop, Tablet e Mobile.

## Etapas de Implementação

1. **Estrutura de Navegação:** Sidebar e BottomNav atualizados.
2. **Home e Catálogos:** Implementação de lazy loading e seções dinâmicas.
3. **Busca e Filtros:** Lógica de debounce e filtragem unificada.
4. **Detalhes e Séries:** Novo modal e visualização de temporadas.
5. **Player:** Refatoração da UI do player e lógica de reconexão.
6. **Polimento Visual:** Ajustes finais de CSS/Tailwind para o tema Premium Dark.