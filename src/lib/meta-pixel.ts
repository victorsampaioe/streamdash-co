import { canTrack, onConsentChange, readChoice } from "@/lib/consent";

/** Pixel do Stream Monitor no Meta (conta de anúncios 1813033566413744). */
const PIXEL_ID = "2289395685308884";
const ALLOWED_HOSTS = ["streammonitor.site", "www.streammonitor.site", "localhost"];
const PRIVATE_PREFIXES = ["/app", "/admin", "/player", "/reset-password", "/verify-email"];

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let initialized = false;
let lastPath: string | null = null;
let unsubscribe: (() => void) | null = null;

function hostAllowed() {
  return typeof window !== "undefined" && ALLOWED_HOSTS.includes(window.location.hostname);
}

function installBase() {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

/** Carrega o Pixel apenas quando a permissão de anúncios permite (Brasil: sim; regiões com consentimento obrigatório: só após aceite). */
async function ensurePixel(): Promise<boolean> {
  if (!hostAllowed()) return false;
  if (!(await canTrack("advertising"))) return false;
  if (!initialized) {
    installBase();
    window.fbq!("init", PIXEL_ID, {}, { agent: "lovable" });
    initialized = true;
  }
  if (!unsubscribe) {
    unsubscribe = onConsentChange(() => {
      if (!window.fbq) return;
      window.fbq("consent", readChoice("advertising") === "denied" ? "revoke" : "grant");
    });
  }
  return true;
}

export function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Um PageView por troca de página (SPA), nunca repetido para o mesmo caminho seguido. */
export async function trackMetaPageView(path: string) {
  if (isPrivatePath(path) || path === lastPath) return;
  lastPath = path;
  if (!(await ensurePixel())) return;
  window.fbq!("track", "PageView");
}

/** Só chamar depois que o servidor confirmou a criação da conta. eventId fica estável para evitar duplicidade. */
export async function trackMetaCompleteRegistration(eventId: string) {
  const key = `meta_cr_sent_${eventId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* sem storage: segue com o eventID, que o Meta deduplica */
  }
  if (!(await ensurePixel())) return;
  window.fbq!("track", "CompleteRegistration", { content_name: "Stream Monitor" }, { eventID: eventId });
}
