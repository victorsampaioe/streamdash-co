import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getAccount from "./tools/get-account";
import listDns from "./tools/list-dns";
import getDnsStatus from "./tools/get-dns-status";
import createDns from "./tools/create-dns";
import updateDns from "./tools/update-dns";
import deleteDns from "./tools/delete-dns";
import listAlerts from "./tools/list-alerts";
import getSubscription from "./tools/get-subscription";
import generateReport from "./tools/generate-report";

// See tanstack-app-mcp knowledge: use VITE_SUPABASE_PROJECT_ID inlined at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "stream-monitor",
  title: "Stream Monitor",
  version: "1.0.0",
  instructions:
    "Ferramentas do Stream Monitor: monitoramento de DNS/servidores, alertas, relatórios e assinatura. Somente assinantes ativos podem executar ações; usuários sem assinatura ativa recebem instruções para renovar. Cada usuário acessa exclusivamente seus próprios dados (RLS). Antes de executar ações destrutivas como excluir DNS, peça confirmação explícita ao usuário.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getAccount,
    listDns,
    getDnsStatus,
    createDns,
    updateDns,
    deleteDns,
    listAlerts,
    getSubscription,
    generateReport,
  ],
});
