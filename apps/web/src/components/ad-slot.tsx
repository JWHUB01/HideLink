'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  AdBackgroundListResponse,
  AdBackgroundVariant,
} from '@anonlink/shared';

import { API_ORIGIN } from '@/lib/config';
import { apiRequest } from '@/lib/http';
import { cn } from '@/lib/utils';

/**
 * Reserved advertising surfaces, and the picture that fills one while there is no
 * creative.
 *
 * AnonLink serves no advertising today and loads no third-party code. These slots exist
 * because the owner asked for the layout to be *ready* for it: the empty columns beside
 * the page, the space under the folded settings and the layer behind a conversation are
 * now real, sized containers, so adding a creative later is a change of content rather
 * than a change of layout (docs/DECISIONS.md D23/D28).
 *
 * ## A picture where a creative would go (owner request 2026-11-17)
 *
 * Each variant may carry a decorative background that shows only while no creative is
 * installed. The owner uploads the pictures in `/admin` ("Фоны рекламных мест"); they
 * are stored server-side and served from the public `GET /api/v1/backgrounds` surface,
 * so every page — including the very first one, before any chat — loads the current
 * picture without a session. The list is polled once and cached; the image URL carries
 * the picture's own update time so a fresh upload is not hidden by the browser cache.
 *
 * ## Rules a creative — and a background — must satisfy
 *
 *  - **Readability first.** Every message is drawn on its own opaque bubble, and the
 *    conversation's header and composer are opaque bars, so a creative can only show in
 *    the gaps between bubbles — never behind a word the user has to read. (The transcript
 *    container itself is deliberately transparent for this reason.) A background image is
 *    shown at low opacity behind a scrim for the same reason: the surface is decoration,
 *    not a place to put text.
 *  - **Nothing renders when empty.** An empty bordered box reads as a broken image, which
 *    is worse than no box at all, so an unfilled slot paints nothing.
 *  - **Hidden from assistive technology.** An empty container is noise: it would be
 *    announced (or, worse, a future creative would be read out unlabelled) with no
 *    relationship to the task the user came for. `aria-hidden` is deliberate; a real
 *    creative that must be perceivable would need its own decision.
 *  - **No third-party scripts without a decision.** Tracking a reader of an anonymous chat
 *    is a privacy change, not an implementation detail: it belongs in `docs/SECURITY.md`
 *    and `docs/DECISIONS.md` before the first network request is made.
 */

/** The slot names match the server's variants exactly (`AdBackgroundVariant`). */
export type AdSlotVariant = AdBackgroundVariant;

/** One shared query: the whole background list, so all slots cost one request. */
const BACKGROUNDS_QUERY_KEY = ['backgrounds'] as const;

/** The public URL of one variant's current picture, or `''` when none is installed. */
function useBackgroundImage(variant: AdSlotVariant): string {
  const { data } = useQuery({
    queryKey: BACKGROUNDS_QUERY_KEY,
    queryFn: () => apiRequest<AdBackgroundListResponse>('/backgrounds'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const installed = data?.backgrounds.find((row) => row.variant === variant);
  if (!installed) return '';
  return `${API_ORIGIN}/api/v1/backgrounds/${variant}?v=${encodeURIComponent(installed.updatedAt)}`;
}

export function AdSlot({ variant, className }: { variant: AdSlotVariant; className?: string }) {
  const image = useBackgroundImage(variant);

  return (
    <div
      aria-hidden="true"
      // A stable hook for the (future) advertising layer, not for tests. `variant` is
      // repeated as an attribute so a stylesheet or an integration can target the two
      // slots without depending on the class names.
      data-ad-slot={variant}
      data-ad-background={image === '' ? undefined : 'image'}
      className={cn(
        variant === 'chat-background' && 'pointer-events-none absolute inset-0',
        variant === 'banner' && 'h-full w-full',
        className,
      )}
      style={
        image === ''
          ? undefined
          : {
              /*
                A plain CSS background, not `<img>`: it is decoration `aria-hidden` already
                hides, it needs no layout of its own, and it costs no extra element. The
                gradient is a scrim — a photograph behind a transcript at full strength
                makes even an opaque bubble harder to read.
              */
              backgroundImage:
                variant === 'chat-background'
                  ? `linear-gradient(color-mix(in oklab, var(--color-card) 82%, transparent), color-mix(in oklab, var(--color-card) 82%, transparent)), url("${cssUrl(image)}")`
                  : `url("${cssUrl(image)}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              // The rails are tall and narrow; centring keeps the subject visible.
              borderRadius: variant === 'banner' ? 'inherit' : undefined,
            }
      }
    />
  );
}

/**
 * Escapes a URL for `url("…")`.
 *
 * The value comes from the server, but a stray quote in it would break the
 * whole style attribute and silently lose the image; escaping costs nothing.
 */
function cssUrl(url: string): string {
  return url.replace(/["\\]/g, '\\$&');
}