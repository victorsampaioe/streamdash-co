# Uptime Kuma privado como motor do Stream Monitor

O Stream Monitor já está preparado para usar uma instância **privada** do Uptime Kuma como motor
de monitoramento. Toda a comunicação acontece **no backend** — usuário e senha do Kuma nunca são
enviados ao navegador.

## 1. Subir a instância

Em uma VPS (1 vCPU / 1 GB já bastam), com Docker instalado:

```bash
docker volume create uptime-kuma
docker run -d --restart=always \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1
```

## 2. Publicar em `kuma.streammonitor.site`

Crie um registro **A** no DNS apontando `kuma` para o IP da VPS e coloque um proxy reverso com
HTTPS na frente (Caddy é o caminho mais curto):

```caddyfile
kuma.streammonitor.site {
    reverse_proxy 127.0.0.1:3001
}
```

Requisitos para a integração funcionar:

- HTTPS válido (Let's Encrypt via Caddy/Nginx);
- WebSocket/long-polling liberado em `/socket.io/` (o Caddy já faz isso por padrão);
- a instância precisa ser acessível pela internet (o backend do Stream Monitor conecta de fora).

## 3. Criar o usuário administrador

Ao abrir `https://kuma.streammonitor.site` pela primeira vez, crie o usuário admin. Use uma senha
forte e **não** ative 2FA nessa conta (o login automatizado não suporta 2FA).

## 4. Conectar ao Stream Monitor

Salve estes segredos no backend (peça ao assistente para abrir o formulário seguro):

| Segredo          | Valor                              |
| ---------------- | ---------------------------------- |
| `KUMA_URL`       | `https://kuma.streammonitor.site`  |
| `KUMA_USERNAME`  | usuário admin do Kuma              |
| `KUMA_PASSWORD`  | senha do admin                     |

## 5. O que acontece automaticamente

Para cada servidor/DNS cadastrado com o motor ativo, o backend cria no Kuma:

| Monitor            | Tipo no Kuma | Finalidade                                  |
| ------------------ | ------------ | ------------------------------------------- |
| HTTP/HTTPS         | `http`       | disponibilidade e tempo de resposta         |
| Ping               | `ping`       | latência de rede                            |
| DNS Record         | `dns`        | resolução e mudança de IP                   |
| Porta TCP          | `port`       | porta configurada (padrão 80)               |
| Player API         | `json-query` | teste da Player API do painel IPTV          |
| Certificado SSL    | `http` + expiry | validade do certificado                  |

Os monitores recebem o prefixo `[SM]` no nome. Os IDs ficam gravados na tabela `servers`
(`kuma_http_id`, `kuma_ping_id`, …) e os resultados são espelhados em
`kuma_monitor_status`, `kuma_heartbeats` e `kuma_incidents`, todas protegidas por RLS —
cada usuário só enxerga os próprios servidores.

O cron do Stream Monitor (`/api/public/cron/check`) sincroniza status, uptime, latência,
certificado e incidentes a cada execução, e provisiona automaticamente os servidores que
ainda não têm monitores.

## 6. Motor próprio continua ativo

Os checks internos, os workers regionais e o módulo IPTV seguem funcionando normalmente.
O Kuma entra como fonte adicional (e mais precisa) de uptime, latência, SSL e incidentes.
Se o Kuma ficar fora do ar, nada quebra: a aba apenas para de receber dados novos.
