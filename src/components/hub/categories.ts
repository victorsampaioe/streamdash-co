export const CATEGORY_LABEL: Record<string, string> = {
  credits: "Créditos de teste",
  panel: "Painel",
  dedicated: "Servidor dedicado",
  vps: "VPS",
  hosting: "Hospedagem",
  cdn: "CDN",
  proxy: "Proxy",
  domain: "Domínio",
  cloudflare: "Conta Cloudflare",
  service_setup: "Configuração de painel",
  service_install: "Instalação de servidor",
  service_migration: "Migração",
  service_dns: "Configuração DNS",
  service_dev: "Desenvolvimento",
  service_bot: "Bot Telegram",
  service_site: "Site",
  service_landing: "Landing page",
  service_app: "App Android/TV",
  partnership: "Parceria",
  help: "Preciso de ajuda",
  other: "Outros",
};

export const CATEGORY_GROUPS: Array<{ label: string; items: string[] }> = [
  {
    label: "Marketplace",
    items: ["credits","panel","dedicated","vps","hosting","cdn","proxy","domain","cloudflare","other"],
  },
  {
    label: "Serviços",
    items: ["service_setup","service_install","service_migration","service_dns","service_dev","service_bot","service_site","service_landing","service_app"],
  },
  {
    label: "Parcerias e ajuda",
    items: ["partnership","help"],
  },
];
