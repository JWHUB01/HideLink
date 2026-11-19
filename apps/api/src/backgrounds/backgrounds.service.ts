import { Injectable } from '@nestjs/common';
import {
  AD_BACKGROUND_MAX_BYTES,
  AD_BACKGROUND_MIME_TYPES,
  AD_BACKGROUND_VARIANTS,
  ErrorCode,
  type AdBackgroundListResponse,
  type AdBackgroundVariant,
  type AdBackgroundView,
  type AdminBackgroundListResponse,
  type AdminBackgroundView,
} from '@anonlink/shared';

import { AppError } from '../common/app-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { sniffMediaMime } from '../chat/chat.media.js';

/**
 * The owner's decorative backgrounds for the advertising slots.
 *
 * Storage is deliberately simple: the bytes live in PostgreSQL (`AdBackground`), one row
 * per variant, so there is no writable disk path to misconfigure and a redeploy cannot
 * orphan files. The only moving part is this service and the database.
 *
 * ## Why an image must survive `sniffMediaMime`
 *
 * The client's `Content-Type` is a hint, not a fact. The bytes decide which canonical type
 * is stored and served — the same line that keeps an HTML document with an image extension
 * from being served as an image. SVG is rejected by the shared allow-list, for the same
 * reason it is rejected for chat images: bytes served from our origin must never be
 * parseable as a document (docs/SECURITY.md).
 */
@Injectable()
export class BackgroundService {
  constructor(private readonly prisma: PrismaService) {}

  /** The public list: which slots have a picture installed. */
  async list(): Promise<AdBackgroundListResponse> {
    const rows = await this.prisma.adBackground.findMany({
      orderBy: { variant: 'asc' },
      select: { variant: true, mimeType: true, bytes: true, updatedAt: true },
    });

    return {
      backgrounds: rows.map((row) => this.toView(row)),
    };
  }

  /** Reads one installed background for public serving. */
  async read(variant: AdBackgroundVariant): Promise<{
    mimeType: string;
    bytes: Buffer;
    updatedAt: Date;
  } | null> {
    const row = await this.prisma.adBackground.findUnique({
      where: { variant: this.toDbVariant(variant) },
      select: { mimeType: true, bytes: true, updatedAt: true },
    });
    if (!row) return null;

    return {
      mimeType: row.mimeType,
      // Prisma returns the column as a `Uint8Array`; `StreamableFile` wants a `Buffer`.
      // A copy is acceptable here — the payload is bounded by the upload ceiling.
      bytes: Buffer.from(row.bytes),
      updatedAt: row.updatedAt,
    };
  }

  /** Writes one variant's background, replacing whatever was there. */
  async save(variant: AdBackgroundVariant, bytes: Buffer): Promise<void> {
    if (bytes.length === 0) throw new AppError(ErrorCode.INVALID_INPUT, 'The uploaded file is empty.');
    if (bytes.length > AD_BACKGROUND_MAX_BYTES) throw new AppError(ErrorCode.MEDIA_TOO_LARGE);

    const mimeType = sniffMediaMime(bytes);
    if (!mimeType || !(AD_BACKGROUND_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new AppError(ErrorCode.MEDIA_TYPE_UNSUPPORTED);
    }

    // `Uint8Array.from` copies into the exact generic (`ArrayBuffer`) Prisma 7's `Bytes`
    // type expects; the write payload is bounded by the same ceiling.
    const bytesColumn = Uint8Array.from(bytes);
    await this.prisma.adBackground.upsert({
      where: { variant: this.toDbVariant(variant) },
      create: { variant: this.toDbVariant(variant), mimeType, bytes: bytesColumn },
      update: { mimeType, bytes: bytesColumn },
    });
  }

  /** Removes one variant's background. Idempotent: a missing picture is not an error. */
  async remove(variant: AdBackgroundVariant): Promise<void> {
    await this.prisma.adBackground.deleteMany({ where: { variant: this.toDbVariant(variant) } });
  }

  /** The admin's per-variant view, with a preview URL for the owner's browser. */
  async adminView(variant: AdBackgroundVariant): Promise<AdminBackgroundView> {
    const row = await this.prisma.adBackground.findUnique({
      where: { variant: this.toDbVariant(variant) },
      select: { mimeType: true, bytes: true, updatedAt: true },
    });
    if (!row) return { variant, mimeType: '', size: 0, updatedAt: '', url: null };

    const view = this.toView({ variant: this.toDbVariant(variant), ...row });
    return {
      variant: view.variant,
      mimeType: view.mimeType,
      size: view.size,
      updatedAt: view.updatedAt,
      url: `/api/v1/backgrounds/${view.variant}`,
    };
  }

  /** The admin's whole list: all slots, each with its current picture or `url: null`. */
  async adminList(): Promise<AdminBackgroundListResponse> {
    // Iterate the shared variant list (not the table) so a slot with no picture is still
    // present with `url: null`; the admin page renders one row per slot regardless.
    const backgrounds = await Promise.all(
      AD_BACKGROUND_VARIANTS.map((variant) => this.adminView(variant)),
    );
    return { backgrounds };
  }

  private toView(row: {
    variant: string;
    mimeType: string;
    bytes: Uint8Array;
    updatedAt: Date;
  }): AdBackgroundView {
    const variant = this.fromDbVariant(row.variant);
    return {
      variant,
      mimeType: row.mimeType,
      size: row.bytes.length,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** The Prisma enum value (no dashes) is the wire variant only on the public edge. */
  private toDbVariant(variant: AdBackgroundVariant): 'rail' | 'banner' | 'chatBackground' {
    switch (variant) {
      case 'chat-background':
        return 'chatBackground';
      case 'rail':
      case 'banner':
        return variant;
    }
  }

  private fromDbVariant(variant: string): AdBackgroundVariant {
    switch (variant) {
      case 'chatBackground':
        return 'chat-background';
      case 'rail':
      case 'banner':
        return variant;
      default:
        // An enum value the code does not know would be a schema/code drift; refuse to
        // serve an unknown slot rather than invent one.
        throw new AppError(ErrorCode.INTERNAL_ERROR);
    }
  }
}