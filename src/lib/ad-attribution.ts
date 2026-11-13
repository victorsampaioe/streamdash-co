/** Origem da visita (primeiro toque, 30 dias). Guarda só parâmetros de campanha, nenhum dado pessoal. */
const KEY = "sm_ad_attribution";
const MAX_AGE_MS = 30 * 86_400_000;

export type AdAttribution = {
  source: "meta_ads" | "other_campaign";
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  at: number;
};

function clean(value: string | null) {
  return value ? value.slice(0, 80).replace(/[^\w\-.]/g, "_") : undefined;
}

/** Retorna a atribuição nova quando esta visita chegou de uma campanha; senão null. */
export function captureAttribution(): AdAttribution | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");
  const fromMeta = params.has("fbclid") || /^(facebook|fb|meta|instagram|ig)$/i.test(utmSource ?? "");
  if (!fromMeta && !utmSource) return null;
  const attribution: AdAttribution = {
    source: fromMeta ? "meta_ads" : "other_campaign",
    utm_source: clean(utmSource) ?? (fromMeta ? "facebook" : undefined),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
    utm_content: clean(params.get("utm_content")),
    at: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    /* ignore */
  }
  return attribution;
}

export function readAttributionSource(): string {
  if (typeof window === "undefined") return "direct";
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as AdAttribution | null;
    if (saved && Date.now() - saved.at < MAX_AGE_MS) return saved.source;
  } catch {
    /* ignore */
  }
  return "direct";
}
