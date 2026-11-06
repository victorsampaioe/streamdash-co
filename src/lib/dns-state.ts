/**
 * Estado de acesso pelo DNS, independente da disponibilidade do serviço IPTV.
 *
 * Um resolvedor isolado pode devolver um IP antigo mesmo quando a maior
 * parte das redes não consegue resolver o domínio. Por isso 1/5 resultados
 * positivos não deve esconder uma falha grave, mas uma única amostra também
 * não é evidência suficiente de indisponibilidade confirmada.
 */
export type DnsAvailability = "online" | "unstable" | "offline";
export type DnsProbeSummary = {
  successCount: number;
  resolverCount: number;
  reportStatus: "ok" | "degraded" | "down";
  previousFailureCount: number;
  previousStatus?: string | null;
};
export function classifyDnsAvailability(input: DnsProbeSummary): {
  status: DnsAvailability;
  failureCount: number;
  severeFailure: boolean;
  reason: string;
} {
  const total = Math.max(0, input.resolverCount);
  const successes = Math.min(total, Math.max(0, input.successCount));
  // Exigir ao menos três fontes para classificar 1 resposta positiva como
  // falha grave; sem fontes suficientes tratar a situação como incerta.
  const severeFailure = total >= 3 ? successes <= 1 : total > 0 && successes === 0;
  const failures = severeFailure ? Math.max(0, input.previousFailureCount) + 1 : 0;
  const offline = severeFailure && (failures >= 2 || input.previousStatus === "offline");
  const status: DnsAvailability = offline ? "offline"
    : severeFailure || successes < total || input.reportStatus !== "ok" || total === 0
      ? "unstable" : "online";
  const reason = offline ? successes === 0
    ? "Nenhum resolvedor confirmou o domínio após verificações consecutivas."
    : "Apenas um resolvedor confirmou o domínio; falha grave repetida."
    : severeFailure ? "Falha grave de resolução, aguardando confirmação."
    : status === "unstable" ? "Resolução parcial ou sinais de instabilidade."
    : "Domínio resolvendo normalmente.";
  return { status, failureCount: failures, severeFailure, reason };
}

export type AccessStatus = "up" | "degraded" | "down" | "unknown";
export function effectiveAccessStatus(s: {
  dns_enabled?: boolean | null;
  dns_status?: string | null;
  current_status?: string | null;
  monitoring_paused?: boolean | null;
}): AccessStatus {
  if (s.monitoring_paused) return "unknown";
  if (s.dns_enabled !== false && s.dns_status === "offline") return "down";
  if (s.current_status === "down") return "down";
  if (s.dns_enabled !== false && s.dns_status === "unstable") return "degraded";
  if (s.current_status === "up" || s.current_status === "degraded") return s.current_status;
  return "unknown";
}

export function accessStatusLabel(s: {
  dns_enabled?: boolean | null;
  dns_status?: string | null;
  current_status?: string | null;
  monitoring_paused?: boolean | null;
}): string {
  if (s.monitoring_paused) return "Monitoramento pausado";
  if (s.dns_enabled !== false && s.dns_status === "offline") return "DNS OFFLINE — acesso pelo domínio indisponível";
  if (s.current_status === "down") return "Servidor OFFLINE confirmado";
  if (s.dns_enabled !== false && s.dns_status === "unstable") return "DNS instável — verificando";
  return s.current_status === "up" ? "Respondendo" : s.current_status === "degraded" ? "Serviço degradado" : "Aguardando verificação";
}
