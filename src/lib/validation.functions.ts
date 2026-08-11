import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSubscription } from "@/lib/subscription-guard";

export const validateHostEligibility = createServerFn({ method: "POST" })
  .middleware([requireActiveSubscription])
  .inputValidator((d: { host: string }) => z.object({ host: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { analyzeHost } = await import("./analysis.server");
    const host = data.host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    
    console.log(`[Diagnostic Log] Validando host: ${host}`);
    
    const result = await analyzeHost(host);
    
    const diagnosis = {
      dns_resolved: result.ipv4.length > 0 || result.ipv6.length > 0,
      ip_found: result.ipv4[0] || result.ipv6[0] || null,
      http_80_ok: result.raw.http_ok,
      https_443_ok: result.ssl_issuer !== null,
      response_ms: result.response_ms,
      is_cloudflare: result.is_cloudflare,
      reason: ""
    };

    let eligible = true;
    if (!diagnosis.dns_resolved) {
      eligible = false;
      diagnosis.reason = "DNS não resolveu (domínio não encontrado ou IP inexistente)";
    } else if (!diagnosis.http_80_ok && !diagnosis.https_443_ok) {
      // Se não responde nem 80 nem 443, pode ser falha temporária ou bloqueio total
      eligible = false;
      diagnosis.reason = "Servidor não respondeu em HTTP (80) nem HTTPS (443)";
    }

    // Fallback: Se DNS resolveu mas HTTP falhou, permitimos se houver IP (pode ser firewall bloqueando o monitor, mas host existe)
    if (!eligible && diagnosis.dns_resolved) {
      eligible = true;
      diagnosis.reason = "Aviso: DNS resolveu, mas o host não respondeu requisições HTTP. Cadastro permitido via fallback de existência.";
    }

    return {
      eligible,
      diagnosis,
      analysis: result
    };
  });
