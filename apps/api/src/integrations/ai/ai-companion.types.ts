import type { SearchPreferences } from '@anonlink/shared';

/**
 * The seam between the chat domain and a neural-network companion.
 *
 * ## Why this exists without a provider
 *
 * The owner wants the capability ready before a provider is chosen (docs/DECISIONS.md
 * D38). The interface, the config keys and the redaction rules are the part that does
 * not depend on the vendor, so they live here; an HTTP client for a concrete model is
 * added later, behind this interface, together with a data-processing decision, a cost
 * cap and retention rules.
 *
 * ## What a provider may and may not see
 *
 * The only thing that ever crosses this boundary is {@link CompanionPayload}: the
 * search filters actually in force, the interface language and the relaxation step.
 * The searcher's User ID, session token, blocks, friendships, reports, archive content
 * and IP/user-agent hashes are not part of the type and therefore cannot be sent by
 * accident (D38 §5).
 *
 * ## Hidden by product decision
 *
 * The companion is presented as an ordinary random peer: a per-chat alias, messages
 * with `from: 'peer'`, and no label in `ChatView`, the protocol or the DOM (D38 §6).
 * The server still has to be able to tell it apart internally for moderation and
 * retention; that marker is server-only and is not part of any type here.
 */

/** The interface languages the widget can converse in. */
export type CompanionLanguage = 'ru' | 'en' | 'zh';

/**
 * Everything the chat domain knows about the search when the fallback is considered.
 *
 * This is the *request* to the seam, not the payload: {@link buildCompanionPayload}
 * turns it into the allow-listed object a provider may receive.
 */
export interface CompanionRequest {
  /** The filters actually in force, after any relaxation the server has applied. */
  criteria: SearchPreferences;
  /** Interface language of the searcher, when known. */
  language?: CompanionLanguage;
  /** How many filters the server has already dropped for this search. */
  relaxationSteps?: number;
}

/** One message the companion would send. Ordinary text; the same limits as a human. */
export interface CompanionReply {
  text: string;
}

/** The persona a companion should present, derived only from the active filters. */
export interface CompanionPersonaPayload {
  genders: string[];
  ageMin: number | null;
  ageMax: number | null;
  countries: string[];
  regions: string[];
  cities: string[];
  languages: string[];
  relaxAllowed: boolean;
}

/**
 * The complete object a provider may ever receive.
 *
 * An explicit allow-list rather than "the request minus a few fields": a new field on
 * `SearchPreferences` must be added here deliberately, which is what keeps a future
 * change from leaking something private by default.
 */
export interface CompanionPayload {
  persona: CompanionPersonaPayload;
  language: CompanionLanguage | null;
  relaxationSteps: number;
}

/** A model client. Implementations are registered in `AiCompanionModule`. */
export interface AiCompanionProvider {
  /** Stable name for logs and diagnostics; never shown to users. */
  readonly name: string;
  /** Whether the client has everything it needs (endpoint, credential, model). */
  isConfigured(): boolean;
  composeReply(payload: CompanionPayload): Promise<CompanionReply>;
}

/** Injection token for the configured provider. */
export const AI_COMPANION_PROVIDER = Symbol('AI_COMPANION_PROVIDER');
