import { createServerFn } from "@tanstack/react-start";
import { getPlayerSettings } from "./player.functions";

/**
 * Middleware de subdomínio para identificar a revenda.
 * Extrai o subdomínio da requisição e resolve para as configurações da revenda.
 */
export const resolveResellerByHost = createServerFn({ method: "GET" })
  .handler(async ({ request }) => {
    const host = request.headers.get("host") || "";
    const parts = host.split(".");
    
    // Se não tiver subdomínio ou for streammonitor.site / www / app, ignora
    if (parts.length < 3) return null;
    
    const subdomain = parts[0].toLowerCase();
    const reserved = ["www", "app", "api", "admin", "core", "dev", "status"];
    if (reserved.includes(subdomain)) return null;

    try {
      const settings = await getPlayerSettings({ data: { slug: subdomain } });
      return settings;
    } catch (e) {
      console.error(`[subdomain] falha ao resolver ${subdomain}:`, e);
      return null;
    }
  });
