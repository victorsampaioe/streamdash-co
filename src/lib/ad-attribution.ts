/** Origem da visita (primeiro toque, 30 dias). Guarda só parâmetros de campanha, nenhum dado pessoal. */
const KEY = "sm_ad_attribution";
const MAX_AGE_MS = 30 * 86_400_000;

export type AdPlatform = "facebook" | "instagram" | "messenger" | "audience_network" | "other";

export type AdAttribution = {
  source: "meta_ads" | "other_campaign";
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  at: number;
};

const META_SOURCES = /^(facebook|fb|meta|instagram|ig|msg|messenger|an|audience_network)$/i;

function clean(value: string | null | undefined) {
  return value ? value.slice(0, 80).replace(/[^\w\-.]/g, "_") : undefined;
}

/** Converte o utm_source do anúncio ({{site_source_name}}: fb, ig, msg, an) na plataforma. */
export function platformFromUtm(utmSource: string | null | undefined): AdPlatform | null {
  const s = (utmSource ?? "").toLowerCase();
  if (!s) return null;
  if (s === "fb" || s === "facebook") return "facebook";
  if (s === "ig" || s === "instagram") return "instagram";
  if (s === "msg" || s === "messenger") return "messenger";
  if (s === "an" || s === "audience_network") return "audience_network";
  return "other";
}

/** Retorna a atribuição nova quando esta visita chegou de uma campanha; senão null. */
export function captureAttribution(): AdAttribution | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");
  const fromMeta = params.has("fbclid") || META_SOURCES.test(utmSource ?? "");
  if (!fromMeta && !utmSource) return null;
  const attribution: AdAttribution = {
    source: fromMeta ? "meta_ads" : "other_campaign",
    utm_source: clean(utmSource) ?? (fromMeta ? "facebook" : undefined),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
    utm_content: clean(params.get("utm_content")),
    utm_term: clean(params.get("utm_term")),
    at: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    /* ignore */
  }
  return attribution;
}

/** Atribuição salva e ainda válida (30 dias), ou null. */
export function readAttribution(): AdAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as AdAttribution | null;
    if (saved && Date.now() - saved.at < MAX_AGE_MS) return saved;
  } catch {
    /* ignore */
  }
  return null;
}

export function readAttributionSource(): string {
  return readAttribution()?.source ?? "direct";
}

/** Plataforma da visita salva (facebook/instagram/...) ou "unknown". */
export function readAttributionPlatform(): string {
  const saved = readAttribution();
  if (!saved || saved.source !== "meta_ads") return "unknown";
  return platformFromUtm(saved.utm_source) ?? "unknown";
}

/** Valida no servidor a origem enviada pelo navegador; nunca confia em texto livre. */
export function sanitizeAttributionInput(input: unknown): {
  acquisition_source: string;
  acquisition_platform: AdPlatform | null;
  acquisition_campaign: string | null;
  acquisition_content: string | null;
  acquisition_placement: string | null;
} | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  const source = a.source === "meta_ads" || a.source === "other_campaign" ? a.source : null;
  if (!source) return null;
  const s = (k: string) => (typeof a[k] === "string" ? clean(a[k] as string) ?? null : null);
  return {
    acquisition_source: source,
    acquisition_platform: source === "meta_ads" ? platformFromUtm(s("utm_source")) : null,
    acquisition_campaign: s("utm_campaign"),
    acquisition_content: s("utm_content"),
    acquisition_placement: s("utm_term"),
  };
}
