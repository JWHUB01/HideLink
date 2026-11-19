import type { AiCompanionProvider, CompanionPayload, CompanionReply } from './ai-companion.types.js';

/**
 * The provider used while no model is configured.
 *
 * It deliberately does **not** return a canned line: an unconfigured companion must
 * fail closed, so a plumbing mistake can never put invented text into a chat and pass
 * it off as a person. The chat domain checks `isAvailable()` before asking, and this
 * rejection is the second line of defence.
 */
export class NoAiCompanionProvider implements AiCompanionProvider {
  readonly name = 'none';

  isConfigured(): boolean {
    return false;
  }

  composeReply(_payload: CompanionPayload): Promise<CompanionReply> {
    return Promise.reject(new Error('No AI companion provider is configured.'));
  }
}
