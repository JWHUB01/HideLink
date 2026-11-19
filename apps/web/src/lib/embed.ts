/**
 * The embed transport.
 *
 * Inside an iframe on somebody else's page the `HttpOnly` session cookie of the main
 * application is a *third-party* cookie: Safari and Firefox block it outright, and
 * Chrome is phasing it out. The widget therefore identifies itself with an explicit
 * bearer token that the API hands to `POST /session/embed` and that lives in the
 * widget frame's own `sessionStorage` — first-party storage of the frame that never
 * leaves it and disappears when the tab closes.
 *
 * `sessionStorage` rather than `localStorage`: an embedded widget is a guest on the
 * page, and two widgets (or two accounts in one browser) must not silently share an
 * identity across tabs. A reload of the same frame keeps its session; a new tab does
 * not — which is the same behaviour the cookie gives the main application.
 */

const TOKEN_KEY = 'anonlink.embed-token';
const EMBED_PREFIX = '/embed';

/** Whether this document is the embeddable widget rather than the main app. */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;

  const { pathname } = window.location;
  return pathname === EMBED_PREFIX || pathname.startsWith(`${EMBED_PREFIX}/`);
}

/** The widget's session token, when this is the embed and one was issued. */
export function readEmbedToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // Storage can be refused (privacy modes, partitioned contexts). The widget then
    // simply cannot keep a session across reloads; it must not fail to boot.
    return null;
  }
}

/** Remembers (or forgets) the widget's session token. */
export function writeEmbedToken(token: string | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (token === null) window.sessionStorage.removeItem(TOKEN_KEY);
    else window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // See `readEmbedToken`: a refused write only costs the session across reloads.
  }
}
