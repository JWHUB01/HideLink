import { DEFAULT_SEARCH_PREFERENCES, type SearchPreferences } from '@anonlink/shared';
import { describe, expect, it } from 'vitest';

import type { PlatformService } from '../src/platform/platform.service.js';
import { buildCompanionPayload } from '../src/integrations/ai/ai-companion.payload.js';
import { NoAiCompanionProvider } from '../src/integrations/ai/ai-companion.provider.none.js';
import { AiCompanionService } from '../src/integrations/ai/ai-companion.service.js';
import type {
  AiCompanionProvider,
  CompanionPayload,
} from '../src/integrations/ai/ai-companion.types.js';

/**
 * The AI companion seam.
 *
 * Nothing here talks to a model: the point of these tests is the boundary itself —
 * what a provider may see, and that an unconfigured companion cannot speak at all.
 * The behavioural half (when a fallback is due, how a chat with it is created) is
 * deliberately out of scope until a provider exists (`docs/DECISIONS.md` D38 §4).
 */

const criteria: SearchPreferences = {
  ...DEFAULT_SEARCH_PREFERENCES,
  genders: ['female'],
  ageMin: 20,
  ageMax: 30,
  cities: ['Москва'],
  regions: ['Татарстан'],
  countries: ['DE'],
  languages: ['ru'],
  relaxAllowed: true,
};

/** A platform policy stub: only the companion switch matters here. */
function platformWith(aiCompanionEnabled: boolean): PlatformService {
  return { aiCompanionEnabled: () => aiCompanionEnabled } as unknown as PlatformService;
}

const configuredProvider: AiCompanionProvider = {
  name: 'test',
  isConfigured: () => true,
  composeReply: async (payload) => ({ text: `persona:${payload.persona.genders.join(',')}` }),
};

describe('AI companion payload', () => {
  it('contains only the allow-listed fields', () => {
    const payload = buildCompanionPayload({ criteria, language: 'ru', relaxationSteps: 2 });

    // An explicit allow-list: a private field added to the preferences later must be
    // added here deliberately, not leak by default.
    expect(Object.keys(payload).sort()).toEqual(['language', 'persona', 'relaxationSteps']);
    expect(Object.keys(payload.persona).sort()).toEqual([
      'ageMax',
      'ageMin',
      'cities',
      'countries',
      'genders',
      'languages',
      'regions',
      'relaxAllowed',
    ]);

    expect(payload).toEqual({
      persona: {
        genders: ['female'],
        ageMin: 20,
        ageMax: 30,
        countries: ['DE'],
        regions: ['Татарстан'],
        cities: ['Москва'],
        languages: ['ru'],
        relaxAllowed: true,
      },
      language: 'ru',
      relaxationSteps: 2,
    });
  });

  it('carries no identity, credentials or moderation data', () => {
    const serialized = JSON.stringify(buildCompanionPayload({ criteria }));

    for (const forbidden of [
      'publicId',
      'userId',
      'token',
      'cookie',
      'session',
      'ipHash',
      'userAgent',
      'blocks',
      'friends',
      'reports',
      'archive',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('copies the lists instead of exposing the live preferences', () => {
    const mutable = { ...criteria, cities: ['Москва'] };
    const payload: CompanionPayload = buildCompanionPayload({ criteria: mutable });

    mutable.cities.push('Казань');

    // The caller keeping a reference to its own preferences must not be able to change
    // what the provider was already given.
    expect(payload.persona.cities).toEqual(['Москва']);
  });

  it('defaults the optional request fields', () => {
    const payload = buildCompanionPayload({ criteria });

    expect(payload.language).toBeNull();
    expect(payload.relaxationSteps).toBe(0);
  });
});

describe('AI companion availability', () => {
  it('cannot speak without a configured provider, even when the owner allows it', async () => {
    const service = new AiCompanionService(platformWith(true), new NoAiCompanionProvider());

    expect(service.isAvailable()).toBe(false);
    await expect(service.composeReply({ criteria })).resolves.toBeNull();
  });

  it('cannot speak when the owner switch is off, even with a provider', async () => {
    const service = new AiCompanionService(platformWith(false), configuredProvider);

    expect(service.isAvailable()).toBe(false);
    await expect(service.composeReply({ criteria })).resolves.toBeNull();
  });

  it('speaks only when both the switch and the provider agree', async () => {
    const service = new AiCompanionService(platformWith(true), configuredProvider);

    expect(service.isAvailable()).toBe(true);
    await expect(service.composeReply({ criteria })).resolves.toEqual({
      text: 'persona:female',
    });
  });

  it('the unconfigured provider fails closed rather than inventing a line', async () => {
    const provider = new NoAiCompanionProvider();

    expect(provider.isConfigured()).toBe(false);
    await expect(
      provider.composeReply(buildCompanionPayload({ criteria })),
    ).rejects.toThrow(/no ai companion provider is configured/i);
  });
});
