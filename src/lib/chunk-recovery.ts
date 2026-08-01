// Mobile networks frequently drop lazily-loaded JS chunks. When that happens the
// router surfaces a generic "check your connection" screen even though the app is
// fine — a single reload fetches the missing chunk and everything works again.

const RELOAD_KEY = "sm-chunk-reload";

export function isChunkLoadError(error: unknown): boolean {
  const msg =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically imported module|ChunkLoadError|Load failed/i.test(
    msg,
  );
}

/** Reloads the page once per session to recover a failed chunk download. */
export function recoverFromChunkError(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 20_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage blocked (private mode) — still try one reload */
  }
  window.location.reload();
  return true;
}

export function installChunkRecovery() {
  if (typeof window === "undefined") return () => {};
  const onPreload = () => recoverFromChunkError();
  const onError = (e: ErrorEvent) => {
    if (isChunkLoadError(e.error) || isChunkLoadError(e.message)) recoverFromChunkError();
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    if (isChunkLoadError(e.reason)) recoverFromChunkError();
  };
  window.addEventListener("vite:preloadError", onPreload as EventListener);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("vite:preloadError", onPreload as EventListener);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
