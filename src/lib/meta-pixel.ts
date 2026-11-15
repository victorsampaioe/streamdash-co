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
let pendingPath: string | null = null;
let unsubscribe: (() => void) | null = null;
const conversionsInFlight = new Set<string>();

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

/** React to consent even when the first PageView was deferred. */
function listenForConsent() {
  if (unsubscribe || !hostAllowed()) return;
  unsubscribe = onConsentChange(() => {
    void (async () => {
      const allowed = await canTrack("advertising");
      if (window.fbq) window.fbq("consent", allowed ? "grant" : "revoke");
      if (allowed && pendingPath && window.location.pathname === pendingPath) {
        void trackMetaPageView(pendingPath);
      }
    })();
  });
}

/** Never initialize or emit events unless the advertising consent policy allows it. */
async function ensurePixel(): Promise<boolean> {
  if (!hostAllowed()) return false;
  listenForConsent();
  if (!(await canTrack("advertising"))) return false;
  if (!initialized) {
    installBase();
    if (!window.fbq) return false;
    window.fbq("init", PIXEL_ID, {}, { agent: "lovable" });
    initialized = true;
  }
  // In Brazil, tracking can be allowed by regional defaults without a stored choice.
  window.fbq!("consent", "grant");
  return true;
}

export function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Do not mark a route as sent until an eligible Pixel event is actually queued. */
export async function trackMetaPageView(path: string) {
  if (isPrivatePath(path) || !hostAllowed() || path === lastPath) return;
  pendingPath = path;
  if (!(await ensurePixel())) return;
  // A late consent/region response must not count a page the visitor has left.
  if (window.location.pathname !== path || lastPath === path) return;
  window.fbq!("track", "PageView");
  lastPath = path;
  pendingPath = null;
}

/** Single browser emission per real, verified conversion. Never consume the marker while consent blocks tracking. */
async function trackConversion(
  key: string,
  eventName: "CompleteRegistration" | "Purchase",
  data: Record<string, unknown>,
  eventID: string,
  durable: boolean,
) {
  if (!hostAllowed() || conversionsInFlight.has(key)) return;
  const store = durable ? window.localStorage : window.sessionStorage;
  try {
    if (store?.getItem(key) === "1") return;
  } catch {
    // Private browsers can disable storage; the in-flight guard and eventID still help.
  }
  conversionsInFlight.add(key);
  try {
    if (!(await ensurePixel())) return;
    try {
      if (store?.getItem(key) === "1") return;
    } catch {
      // Ignore private-mode storage restrictions.
    }
    window.fbq!("track", eventName, data, { eventID });
    try { store?.setItem(key, "1"); } catch { /* Ignore blocked storage. */ }
  } finally {
    conversionsInFlight.delete(key);
  }
}

/** Only call after the signup API confirms the account (HTTP 201). */
export async function trackMetaCompleteRegistration(eventId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return;
  await trackConversion(
    `meta_cr_sent_${eventId}`,
    "CompleteRegistration",
    { content_name: "Stream Monitor" },
    eventId,
    false,
  );
}

/** Only call after the authenticated payment API confirms APPROVED; never for pending or credit-only payments. */
export async function trackMetaPurchase(paymentId: string, amountCents: number, currency = "BRL") {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== "BRL") return;
  await trackConversion(
    `meta_purchase_sent_${paymentId}`,
    "Purchase",
    { value: amountCents / 100, currency: "BRL" },
    `streammonitor_purchase_${paymentId}`,
    true,
  );
}
