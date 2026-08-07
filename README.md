# Stream Status Hub

Crie uma aplicação web profissional de monitoramento de infraestrutura com design moderno (estilo Datadog/Uptime Kuma).

Autenticação

 Login com e-mail e senha.

 Recuperação de senha.

 Painel administrativo.

 Controle de usuários e permissões.

Cadastro de servidores

 Nome do servidor.

 Domínio.

 Endereço IP.

 DNS.

 Porta.

 Protocolo (HTTP, HTTPS, TCP).

 Categoria.

 Observações.

Monitoramento automático

 Verificação a cada 30 segundos (configurável).

 Resolução DNS.

 Disponibilidade HTTP/HTTPS.

 Latência.

 Tempo de resposta.

 Certificado SSL (dias restantes).

 Histórico de falhas.

 Registro de uptime.

Dashboard

 Cartões com Online/Offline.

 Indicadores em verde, amarelo e vermelho.

 Gráficos de disponibilidade.

 Histórico por servidor.

 Filtros e pesquisa.

 Modo escuro e claro.

 Interface responsiva.

Alertas

 Notificação por e-mail.

 Notificação por Discord.

 Notificação por Telegram.

 Webhooks.

 Alertas apenas após X falhas consecutivas.

Banco de dados

 PostgreSQL.

 Histórico completo de eventos.

 Logs.

 Backup automático.

Tecnologias

 React + TypeScript.

 Tailwind CSS.

 Backend em Node.js.

 API REST.

 Docker.

 Deploy na AWS.

 Código limpo e documentado.

Extras

 API para integração.

 Exportação em CSV.

 Pesquisa rápida.

 Dashboard em tempo real.

 Página pública de status.

 Sistema preparado para milhares de verificações por minuto.

 Interface extremamente rápida, moderna e intuitiva. nome do site é streammonitor.site porta deve ser fixa em 80 para todos os monitoramentos. Não exibir campo para selecionar ou editar a porta. Todas as verificações HTTP devem utilizar automaticamente a porta 80. O usuário só deverá informar o nome do servidor, o domínio ou DNS e uma descrição opcional.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://streamdash-co.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/53f0eb67-2e35-46bc-9ab5-dc7ffc20dcbd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
