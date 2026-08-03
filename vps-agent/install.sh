#!/usr/bin/env bash
# Stream Monitor — instalação do agente regional em VPS (Ubuntu/Debian)
# Uso:
#   sudo SM_AGENT_ID=... SM_AGENT_SECRET=... bash install.sh
set -euo pipefail

SM_BASE_URL="${SM_BASE_URL:-https://streammonitor.site}"
SM_REGION="${SM_REGION:-br-sp-vps}"
SM_INTERVAL="${SM_INTERVAL:-30}"
SM_CONCURRENCY="${SM_CONCURRENCY:-8}"
DIR=/opt/streammonitor-agent

if [ -z "${SM_AGENT_ID:-}" ] || [ -z "${SM_AGENT_SECRET:-}" ]; then
  echo "Defina SM_AGENT_ID e SM_AGENT_SECRET antes de rodar." >&2
  exit 1
fi

echo "==> Instalando Node.js 20 (se necessário)"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> Copiando agente para $DIR"
mkdir -p "$DIR"
cp "$(dirname "$0")/agent.mjs" "$DIR/agent.mjs"
chmod 700 "$DIR"

echo "==> Gravando configuração"
cat > /etc/streammonitor-agent.env <<EOF
SM_BASE_URL=$SM_BASE_URL
SM_AGENT_ID=$SM_AGENT_ID
SM_AGENT_SECRET=$SM_AGENT_SECRET
SM_REGION=$SM_REGION
SM_INTERVAL=$SM_INTERVAL
SM_CONCURRENCY=$SM_CONCURRENCY
EOF
chmod 600 /etc/streammonitor-agent.env

echo "==> Criando serviço systemd"
cat > /etc/systemd/system/streammonitor-agent.service <<EOF
[Unit]
Description=Stream Monitor - Agente Regional ($SM_REGION)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/streammonitor-agent.env
ExecStart=/usr/bin/node $DIR/agent.mjs
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now streammonitor-agent
sleep 3
systemctl --no-pager -l status streammonitor-agent | head -20

echo
echo "Pronto. Logs em tempo real: journalctl -u streammonitor-agent -f"
