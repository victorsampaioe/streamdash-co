import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

/**
 * Cadastro rápido: valida o formato e impede alvos privados sem esperar
 * sondagens HTTP/SSL, WHOIS ou geolocalização. O monitoramento agendado
 * verifica a disponibilidade real após o cadastro.
 */
export const validateHostEligibility = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { host: string }) => z.object({ host: z.string().min(3).max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { validateOutboundUrl } = await import("./ssrf-guard");
    const host = data.host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    const domainPattern = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
    const { isIP } = await import("node:net");
    if (!domainPattern.test(host) && isIP(host) !== 4) {
      return { eligible: false, diagnosis: { reason: "Informe um domínio ou IPv4 válido." } };
    }
    const safe = validateOutboundUrl(`http://${host}`);
    if (!safe.safe) {
      return { eligible: false, diagnosis: { reason: "Endereço privado ou não permitido para monitoramento." } };
    }
    return {
      eligible: true,
      diagnosis: { reason: "Endereço válido. A análise DNS será feita automaticamente após o cadastro." },
    };
  });
