import { z } from 'zod';

/**
 * Advertising-background slots and their upload rules, shared by the browser and the API.
 *
 * A background is decoration: it fills an empty ad slot (docs/DECISIONS.md D23/D28) until a
 * creative is installed. The owner uploads one image per variant in `/admin`; the picture is
 * then served to everyone from the API. The browser re-validates against these same
 * constants for immediate feedback, while the server re-checks everything because a browser
 * check is decoration too.
 */

/** The named surfaces that can carry a background. The enum of the same name in Prisma
 * mirrors these values — they are the storage key and therefore the wire contract. */
export const AD_BACKGROUND_VARIANTS = ['rail', 'banner', 'chat-background'] as const;
export type AdBackgroundVariant = (typeof AD_BACKGROUND_VARIANTS)[number];

export const adBackgroundVariantSchema = z.enum(AD_BACKGROUND_VARIANTS);

/**
 * A canonical MIME type the API will accept for a background.
 *
 * SVG is deliberately absent for the same reason it is absent from chat images: the same
 * bytes served from our origin must never be parseable as a document (docs/SECURITY.md).
 * GIF is allowed — it is a normal image format; animated GIFs are not re-encoded here.
 */
export const AD_BACKGROUND_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

/** Upload ceiling for one background. Generous: a full-bleed chat backdrop may be large. */
export const AD_BACKGROUND_MAX_BYTES = 10 * 1024 * 1024;

/** The wire shape of one slot in `GET /backgrounds` (public) and in the admin list. */
export interface AdBackgroundView {
  /** The slot this picture fills. */
  variant: AdBackgroundVariant;
  /** Canonical MIME type decided by magic bytes on the server. */
  mimeType: string;
  /** Exact byte length. Used for diagnostics, never for trust. */
  size: number;
  /** When this picture was uploaded. */
  updatedAt: string;
}

/** REST: `GET /api/v1/backgrounds` — the public list of installed backgrounds. */
export interface AdBackgroundListResponse {
  backgrounds: AdBackgroundView[];
}

/** REST: `GET /api/v1/admin/backgrounds` — what the owner's page edits. */
export interface AdminBackgroundListResponse {
  backgrounds: AdminBackgroundView[];
}

/** REST: `GET /api/v1/admin/backgrounds/:variant` — one slot, as the admin page edits it. */
export interface AdminBackgroundView {
  variant: AdBackgroundVariant;
  mimeType: string;
  size: number;
  updatedAt: string;
  /** A URL the owner's browser can load to preview the current picture. `null` = none. */
  url: string | null;
}

/** REST: `GET /api/v1/admin/backgrounds/:variant` param. */
export const adminBackgroundParamsSchema = z
  .object({ variant: adBackgroundVariantSchema })
  .strict();

export type AdminBackgroundParams = z.infer<typeof adminBackgroundParamsSchema>;