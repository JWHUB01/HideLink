import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  adminBackgroundParamsSchema,
  AD_BACKGROUND_MAX_BYTES,
  ErrorCode,
  type AdminBackgroundListResponse,
  type AdminBackgroundParams,
  type AdminBackgroundView,
} from '@anonlink/shared';
import type { Request } from 'express';

import { AppError } from '../common/app-error.js';
import { zodParam } from '../common/zod-validation.pipe.js';
import { Anonymous } from '../identity/request-context.js';
import { AdminGuard } from '../archive/admin.guard.js';
import { BackgroundService } from './backgrounds.service.js';

/**
 * The owner's surface for uploading decorative backgrounds to the advertising slots.
 *
 * The whole class is guarded exactly like the archive surface: `@UseGuards(AdminGuard)`
 * and `@Anonymous()`, because a background is platform content and only `ADMIN_TOKEN`
 * may change it. The public serving of the bytes lives in {@link BackgroundsPublicController} —
 * the upload and the delivery are deliberately different ends of the trust boundary.
 *
 * Upload is a raw-body REST call, not multipart, for the same reasons as the chat
 * attachment upload (`ChatMediaController`): the metadata here is the variant in the URL,
 * the body stays a plain `application/octet-stream`, and no parser dependency is added for
 * one endpoint.
 */
@Controller('admin/backgrounds')
@Anonymous()
@UseGuards(AdminGuard)
export class BackgroundsAdminController {
  constructor(private readonly backgrounds: BackgroundService) {}

  /** Every slot, with its current picture or `url: null`. */
  @Get()
  async list(): Promise<AdminBackgroundListResponse> {
    return this.backgrounds.adminList();
  }

  /** One slot. The admin page fetches it to know whether a preview exists. */
  @Get(':variant')
  async get(
    @Param(zodParam(adminBackgroundParamsSchema)) params: AdminBackgroundParams,
  ): Promise<AdminBackgroundView> {
    return this.backgrounds.adminView(params.variant);
  }

  /**
   * Replaces (or installs) one variant's background.
   *
   * `Content-Length` is checked before the body is read so a known-oversized upload is
   * refused before the API allocates anything; the service enforces the same ceiling again.
   */
  @Post(':variant')
  @HttpCode(200)
  async upload(
    @Param(zodParam(adminBackgroundParamsSchema)) params: AdminBackgroundParams,
    @Req() request: Request,
  ): Promise<AdminBackgroundView> {
    const bytes = await readBody(request, AD_BACKGROUND_MAX_BYTES);
    await this.backgrounds.save(params.variant, bytes);
    return this.backgrounds.adminView(params.variant);
  }

  /** Removes one variant's background. Idempotent. */
  @Delete(':variant')
  @HttpCode(200)
  async remove(
    @Param(zodParam(adminBackgroundParamsSchema)) params: AdminBackgroundParams,
  ): Promise<{ removed: true }> {
    await this.backgrounds.remove(params.variant);
    return { removed: true };
  }
}

/**
 * Reads a request body with a hard ceiling.
 *
 * `Content-Length` is checked first so a known-oversized upload is refused before the
 * bytes are accumulated; the streaming check is the backstop for a chunked request.
 * Mirrors `readRequestBody` in the chat media controller.
 */
async function readBody(request: Request, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(request.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    throw new AppError(ErrorCode.MEDIA_TOO_LARGE);
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      request.destroy();
      throw new AppError(ErrorCode.MEDIA_TOO_LARGE);
    }
    chunks.push(buffer);
  }

  if (total === 0) throw new AppError(ErrorCode.INVALID_INPUT, 'The uploaded file is empty.');
  return Buffer.concat(chunks, total);
}