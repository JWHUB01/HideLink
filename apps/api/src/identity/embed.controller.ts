import { Controller, Delete, Inject, Post, Req } from '@nestjs/common';
import type { EmbedSessionView, SessionView } from '@anonlink/shared';

import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { parseBearerToken } from '../common/bearer.js';
import { clientAddress } from '../common/cookies.js';
import { RateLimitService } from '../common/rate-limit.service.js';
import { PlatformService } from '../platform/platform.service.js';
import { IdentityService, type AuthenticatedIdentity } from './identity.service.js';
import {
  Anonymous,
  CurrentIdentity,
  type RequestWithIdentity,
} from './request-context.js';

/**
 * Anonymous sessions for an embedded widget.
 *
 * ## Why this exists separately from `POST /session`
 *
 * The regular session lives in an `HttpOnly` cookie. Inside an iframe on a
 * third-party page that cookie is a *third-party* cookie, and every current browser
 * either blocks it (Safari, Firefox) or is phasing it out — so a widget that relied on
 * it would silently lose its identity on the embedder's page.
 *
 * The embed therefore gets the same opaque token over an explicit transport: this
 * endpoint returns it in the response body, the widget keeps it in `sessionStorage`
 * of its own frame, and presents it as `Authorization: Bearer …` on REST calls and in
 * the socket handshake (see `RequestGuard` and `ChatGateway`).
 *
 * ## No cookie is written
 *
 * Deliberately: the embed must not create a *first-party-looking* session for the
 * API origin that the surrounding page could then borrow. The token only exists in
 * the widget frame's storage.
 */
@Controller('session/embed')
export class EmbedSessionController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly rateLimit: RateLimitService,
    private readonly platform: PlatformService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Ensures the widget has an identity.
   *
   * Idempotent like `POST /session`: a valid bearer token returns the existing
   * identity and the same token, so a reload of the widget does not mint identities
   * in a loop.
   */
  @Post()
  @Anonymous()
  async bootstrap(@Req() request: RequestWithIdentity): Promise<EmbedSessionView> {
    const presented = parseBearerToken(request.headers.authorization);
    if (presented && request.identity) {
      return { session: this.toView(request.identity), token: presented };
    }

    // Only actual creations consume the (address-keyed) creation budget.
    const address = clientAddress(
      request.headers,
      request.socket?.remoteAddress,
      this.config.TRUST_PROXY,
    );
    this.rateLimit.enforce('sessionCreate', `address:${address ?? 'unknown'}`);

    const issued = await this.identityService.createIdentity({
      address,
      userAgent: request.headers['user-agent'],
    });

    return { session: this.toView(issued.identity), token: issued.token };
  }

  /**
   * "Get a new User ID" for the widget.
   *
   * Mirrors `DELETE /session`: every session of the identity is revoked and a brand
   * new token is returned, so the widget can keep working without a cookie.
   */
  @Delete()
  async rotate(
    @CurrentIdentity() identity: AuthenticatedIdentity,
    @Req() request: RequestWithIdentity,
  ): Promise<EmbedSessionView> {
    // Same abuse metadata as the cookie flow: a rotated widget session is still a
    // creation, and losing the address/user-agent hash here would leave that gap open.
    const issued = await this.identityService.rotate(identity, {
      address: clientAddress(
        request.headers,
        request.socket?.remoteAddress,
        this.config.TRUST_PROXY,
      ),
      userAgent: request.headers['user-agent'],
    });
    return { session: this.toView(issued.identity), token: issued.token };
  }

  private toView(identity: AuthenticatedIdentity): SessionView {
    return {
      publicId: identity.publicId,
      createdAt: identity.identityCreatedAt.toISOString(),
      sessionExpiresAt: identity.sessionExpiresAt.toISOString(),
      blockingEnabled: this.platform.blockingEnabled(),
      settings: identity.settings,
    };
  }
}
