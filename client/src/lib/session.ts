/**
 * SESSION
 * =======
 * The server hands out a session token after embed SSO verification
 * (/api/auth/verify-embed) or a direct sign-in (/api/auth/standalone-login).
 * Every same-origin /api request must carry it in the X-Manager-Log-Session
 * header, or the server answers 401.
 *
 * Components call fetch() directly all over the app, so instead of threading
 * the token through each call we wrap window.fetch once.
 */

const SESSION_HEADER = "X-Manager-Log-Session";
// Direct sign-ins are remembered across reloads; embed sessions live in memory only
const STORAGE_KEY = "managerLog.standaloneSession";

let sessionToken: string | null = null;
let installed = false;
const expiredListeners = new Set<() => void>();

function isOwnApiRequest(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.href);
  return url.origin === window.location.origin && url.pathname.startsWith("/api/");
}

function installFetchWrapper() {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!sessionToken || !isOwnApiRequest(input)) {
      return originalFetch(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(SESSION_HEADER, sessionToken);
    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 401) {
      clearSession();
      expiredListeners.forEach(listener => listener());
    }
    return response;
  };
}

export function setSessionToken(token: string, options: { remember?: boolean; expiresAt?: number } = {}) {
  sessionToken = token;
  if (options.remember && options.expiresAt) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt: options.expiresAt }));
    } catch {
      // Storage blocked: the user just signs in again after a reload
    }
  }
  installFetchWrapper();
}

/** Restores a remembered direct sign-in; returns false if there is none or it expired */
export function restoreStandaloneSession(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved.token === "string" && saved.expiresAt > Date.now()) {
      setSessionToken(saved.token);
      return true;
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Unreadable or blocked storage counts as signed out
  }
  return false;
}

export function clearSession() {
  sessionToken = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Called when the server rejects the session (expired or revoked) */
export function onSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}
