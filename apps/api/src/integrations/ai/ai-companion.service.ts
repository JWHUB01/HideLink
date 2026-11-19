import { Inject, Injectable } from '@nestjs/common';

import { PlatformService } from '../../platform/platform.service.js';
import { buildCompanionPayload } from './ai-companion.payload.js';
import {
  AI_COMPANION_PROVIDER,
  type AiCompanionProvider,
  type CompanionPayload,
  type CompanionReply,
  type CompanionRequest,
} from './ai-companion.types.js';

/**
 * The single gate between "the owner allows a companion" and "text may be generated".
 *
 * ## Two keys, not one
 *
 * The owner switch (`aiCompanionEnabled`) is a *permission*; a configured provider is
 * a *capability*. Neither is enough alone: a permission without a provider must be
 * inert (`docs/DECISIONS.md` D38 §4: "until a provider exists, the switch is stored but
 * nothing reads it"), and a provider without the permission must never be called. The
 * switch is re-read on every check, so flipping it off in `/admin` takes effect
 * immediately instead of on the next restart.
 *
 * ## What this service is not
 *
 * It does not decide *when* a fallback is due, does not create chats and does not
 * touch the matchmaking queue. D38 leaves the wait and the "relaxation first?" question
 * to the adapter, and a companion must never take a ticket ahead of a real candidate.
 * Those decisions belong to the chat domain once a provider is chosen; this service is
 * only the boundary every such call has to pass through.
 */
@Injectable()
export class AiCompanionService {
  constructor(
    private readonly platform: PlatformService,
    @Inject(AI_COMPANION_PROVIDER) private readonly provider: AiCompanionProvider,
  ) {}

  /** Whether a call could be made at all: permission **and** capability. */
  isAvailable(): boolean {
    return this.platform.aiCompanionEnabled() && this.provider.isConfigured();
  }

  /**
   * The exact payload that would be sent, for tests and diagnostics.
   *
   * Nothing private is in it by construction; see `buildCompanionPayload`.
   */
  payloadFor(request: CompanionRequest): CompanionPayload {
    return buildCompanionPayload(request);
  }

  /**
   * Asks the model for one message, or returns `null` when the seam is closed.
   *
   * `null` rather than an exception for the unavailable case: "the owner has not
   * enabled a companion" is a routine answer, not a failure. A configured provider
   * that throws does propagate — the caller decides whether to retry, and a silent
   * empty message would be worse than falling back to the queue.
   */
  async composeReply(request: CompanionRequest): Promise<CompanionReply | null> {
    if (!this.isAvailable()) return null;

    return this.provider.composeReply(this.payloadFor(request));
  }
}
