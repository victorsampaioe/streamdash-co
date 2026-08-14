/**
 * Sondas STATELESS executadas no Core AWS (worker externo).
 *
 * Nenhuma função deste módulo toca o banco de dados: o Core recebe todos os
 * parâmetros na tarefa, executa o trabalho pesado de rede com o IP da EC2 e
 * devolve JSON puro. Quem persiste é sempre o Painel (Lovable Backend).
 */

export type StatelessProbeResult = {
  status: "up" | "down" | "degraded" | "unknown";
  httpStatus: number | null;
  latency: number | null;
  dnsIp: string | null;
  error: string | null;
  sslDays: number | null;
};

/** DNS + HTTP + SSL de um host, sem gravar nada. */
export async function probeHostStateless(host: string): Promise<StatelessProbeResult> {
  const { probe, getSslDaysRemaining } = await import("./monitoring.server");
  const p = await probe(host);
  let sslDays: number | null = null;
  try {
    sslDays = await getSslDaysRemaining(host);
  } catch {
    /* opcional, não fatal */
  }
  return { ...p, sslDays };
}

/** Análise DNS completa (resolvers, regiões, registros), sem gravar nada. */
export async function probeDnsStateless(host: string, recentChanges = 0) {
  const { analyzeDns } = await import("./dns.server");
  return await analyzeDns(host, recentChanges);
}

/** Validação de login Xtream, sem gravar nada. */
export async function probeIptvLoginStateless(
  host: string,
  username: string,
  password: string,
) {
  const { validateXtreamLogin } = await import("./iptv.server");
  return await validateXtreamLogin(host, username, password);
}
