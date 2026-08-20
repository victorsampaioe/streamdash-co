# Stream Monitor Play

INSTRUÇÃO PRINCIPAL — ALTERAÇÃO EXPLICITAMENTE SOLICITADA
O usuário pediu uma mudança real no projeto. Implemente diretamente o pedido, sem transformar a execução em uma simples explicação.
Não invente requisitos. Preserve tudo que não fizer parte do pedido.
Inspecione os arquivos/componentes responsáveis antes de editar e execute somente as mudanças necessárias.
Não pare aguardando aprovação de um plano quando a alteração puder ser executada diretamente.

PEDIDO ORIGINAL DO USUÁRIO:
FINALIZAÇÃO DO STREAM MONITOR PLAY ANDROID — MANTER LAYOUT NOVO

Preciso que você continue o projeto Android atual e finalize ele.

Atenção: não quero voltar para o MVP antigo e não quero recriar aquele projeto simples.

O que eu quero é exatamente o projeto com o novo layout do Stream Monitor Play, porém com todos os erros corrigidos e compilando perfeitamente.

O projeto já teve uma versão MVP validada em dispositivo real, funcionando com:

Login Xtream;
Conexão direta com servidor IPTV;
Media3 / ExoPlayer;
HLS;
MP4;
MPEG-TS;
Range / Seek;
Retomar reprodução;
Compatibilidade validada com servidores como UNIPLAY.

Essa base técnica não pode ser quebrada.

O objetivo agora é:

Pegar o projeto novo, manter o design novo e corrigir toda a parte técnica até gerar APK.

NÃO FAZER

❌ Não criar outro aplicativo do zero.
❌ Não voltar para a interface antiga.
❌ Não remover funcionalidades já criadas.
❌ Não substituir o player funcional por outro teste.
❌ Não parar no primeiro erro encontrado.

Fazer uma análise completa.

Corrigir todos os problemas atuais

O projeto atualmente apresenta erros como:

Android resource linking failed;
problemas no splash_screen.xml;
erros Kotlin;
referências quebradas;
imports faltando;
classes não encontradas;
dependências incompatíveis;
erros de compilação.

Fazer uma varredura completa no projeto.

Só finalizar quando estiver:

✅ Gradle BUILD SUCCESSFUL
✅ Nenhum erro vermelho no Android Studio
✅ APK Debug gerado
✅ Aplicativo abrindo normalmente

Manter a nova arquitetura

Organizar sem quebrar:

data
network
domain
ui
player
monitor

A reprodução continua fora do Core:

Android → servidor IPTV diretamente.

O Stream Monitor fica responsável por:

autenticação;
identificação do servidor;
licença;
status;
monitoramento;
identidade do revendedor.
Aplicativo final

Nome:

Stream Monitor Play

Antes do login:

Logo Stream Monitor;
Splash profissional.

Depois do login:

Carregar automaticamente:

logo do revendedor;
nome do revendedor;
identidade visual;
"Powered by Stream Monitor" discreto.

O cliente não deve ver:

DNS;
IP;
player_api;
configurações técnicas;
servidores internos.
Login novo

A tela deve mostrar somente:

Usuário
Senha

O sistema faz:

Usuário + senha → identifica servidor autorizado → identifica revendedor → valida licença → libera catálogo.

Licença Stream Monitor Play

A liberação deve depender do servidor:

cliente → server_id → reseller_id → licença ativa.

Sem licença:

mostrar mensagem amigável.

Nunca confiar somente no APK.

Tela de status antes do catálogo

Antes de carregar conteúdo:

Mostrar:

🟢 Serviço funcionando normalmente

🟡 Instabilidade detectada

🔴 Serviço indisponível

Nunca mostrar tela preta ou erro técnico.

Layout novo

Manter o design profissional:

tema escuro;
estilo streaming premium;
preparado para Android TV;
controle remoto;
celular;
navegação fluida.

Estrutura:

Home:

Destaques;
Continuar assistindo;
Filmes;
Séries;
TV ao vivo;
Minha Lista;
Busca.

Não carregar milhares de conteúdos de uma vez.

Usar:

paginação;
lazy loading;
cache;
carregamento sob demanda.
Filmes e Séries

Filmes:

capa;
backdrop;
descrição;
ano;
gênero;
duração;
assistir.

Séries:

temporadas;
episódios;
progresso;
próximo episódio.

Usar o player que já existe.

TV ao vivo
Categorias;
canais;
favoritos;
troca rápida;
EPG quando disponível.
Performance

O aplicativo precisa ser leve:

Coil/cache imagens;
cancelar carregamentos fora da tela;
evitar carregar catálogo inteiro;
evitar travamentos.
Depois de corrigir

Executar:

Clean Project
Rebuild Project
Generate APK Debug

E me informar:

se compilou;
onde está o APK;
quais erros foram corrigidos.

Resumo: não quero um novo MVP. Quero o Stream Monitor Play com o layout novo que já foi criado, apenas totalmente corrigido e pronto para gerar APK.

RESULTADO ESPERADO: implemente integralmente a alteração solicitada e preserve funcionalidades não relacionadas.

## Stack
- Kotlin + Jetpack Compose
- AndroidX Media3 / ExoPlayer (HLS, MP4 com seek/range, MPEG-TS)
- OkHttp (User-Agent configurável, HTTP e HTTPS, aceita certificado self-signed)
- Retrofit + OkHttp para comunicação com API Xtream e Stream Monitor

## Estrutura do Projeto
1. Tela de login Xtream simplificada: resolução automática de DNS e validação de licença.
2. Integração com Xtream:
   - Login e carregamento de categorias
   - Listagem de canais ao vivo, filmes e séries com posters
   - Player ExoPlayer otimizado para HLS e Range Requests
3. Interface Premium OTT: Estilo Netflix/Disney+, Mobile-first e compatível com Android TV.

## Build da APK
Requer JDK 17 + Android SDK:
```bash
cd android-mvp
./gradlew assembleDebug
```

