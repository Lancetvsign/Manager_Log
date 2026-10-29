/**
 * EMBED SESSION
 * =============
 * After /api/auth/verify-embed succeeds, the server returns a session token
 * bound to the verified club. Every same-origin /api request must carry it in
 * the X-Manager-Log-Session header, or the server answers 401.
 *
 * Components call fetch() directly all over the app, so instead of threading
 * the token through each call we wrap window.fetch once.
 */

const SESSION_HEADER = "X-Manager-Log-Session";

let sessionToken: string | null = null;
let installed = false;

function isOwnApiRequest(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.href);
  return url.origin === window.location.origin && url.pathname.startsWith("/api/");
}

export function setSessionToken(token: string) {
  sessionToken = token;
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!sessionToken || !isOwnApiRequest(input)) {
      return originalFetch(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(SESSION_HEADER, sessionToken);
    return originalFetch(input, { ...init, headers });
  };
}
