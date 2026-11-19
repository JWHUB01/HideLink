import { NextResponse, type NextRequest } from 'next/server';

/**
 * Frame policy for the embeddable widget.
 *
 * ## Why this is not in `next.config.ts`
 *
 * `X-Frame-Options` cannot express an allow-list: it only says "never" or "same
 * origin". A widget that is meant to live inside other sites needs
 * `Content-Security-Policy: frame-ancestors`, and that header must apply to the
 * embed route *instead of* `X-Frame-Options` — a page cannot both allow and deny
 * framing. Setting the two per path is exactly what a proxy is for.
 *
 * Everything except `/embed` keeps `X-Frame-Options: DENY`: the owner's page and
 * the main application have no reason to be framed, and clickjacking protection
 * for them must not be weakened in order to make the widget embeddable.
 *
 * ## The allow-list
 *
 * `EMBED_FRAME_ANCESTORS` is the raw CSP source list, space-separated. The default
 * `*` means "any site may frame the widget", which is the point of an embeddable
 * chat; set it to an exact list (for example `https://vk.com https://web.telegram.org`)
 * to restrict embedding to known social platforms. Read at request time: the proxy
 * runs on the Node.js runtime, so changing the value needs a restart, not a rebuild.
 */
const EMBED_PATH = '/embed';

function frameAncestors(): string {
  const configured = process.env['EMBED_FRAME_ANCESTORS']?.trim();
  return configured === undefined || configured === '' ? '*' : configured;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isEmbed = pathname === EMBED_PATH || pathname.startsWith(`${EMBED_PATH}/`);

  const response = NextResponse.next();

  if (isEmbed) {
    response.headers.set('Content-Security-Policy', `frame-ancestors ${frameAncestors()}`);
  } else {
    response.headers.set('X-Frame-Options', 'DENY');
  }

  return response;
}

export const config = {
  // Documents only: static assets do not need a frame policy of their own.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
