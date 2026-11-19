import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import {
  adminBackgroundParamsSchema,
  ErrorCode,
  type AdBackgroundListResponse,
  type AdminBackgroundParams,
} from '@anonlink/shared';

import { AppError } from '../common/app-error.js';
import { zodParam } from '../common/zod-validation.pipe.js';
import { Anonymous } from '../identity/request-context.js';
import { BackgroundService } from './backgrounds.service.js';

/**
 * Public serving of the owner's decorative backgrounds.
 *
 * Deliberately anonymous: every page (including the first, before any chat) loads a
 * background from here, and auth would block that. The bytes are public content, and the
 * picture is chosen by the owner, not by user input — the same reason static assets are
 * served without a session. There is nothing per-user to protect.
 */
@Controller('backgrounds')
export class BackgroundsPublicController {
  constructor(private readonly backgrounds: BackgroundService) {}

  /** Which slots have a picture installed; `updatedAt` lets the web app cache-bust. */
  @Get()
  @Anonymous()
  @Header('Cache-Control', 'public, max-age=60')
  async list(): Promise<AdBackgroundListResponse> {
    return this.backgrounds.list();
  }

  /** The bytes of one installed background. A slot with no picture is a normal 404. */
  @Get(':variant')
  @Anonymous()
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=300')
  async image(@Param(zodParam(adminBackgroundParamsSchema)) params: AdminBackgroundParams): Promise<StreamableFile> {
    const stored = await this.backgrounds.read(params.variant);
    if (stored === null) throw new AppError(ErrorCode.ROUTE_NOT_FOUND);

    return new StreamableFile(stored.bytes, { type: stored.mimeType, length: stored.bytes.length });
  }
}