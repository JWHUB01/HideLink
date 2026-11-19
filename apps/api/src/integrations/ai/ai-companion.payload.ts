import type { CompanionPayload, CompanionRequest } from './ai-companion.types.js';

/**
 * Builds the only object a provider may ever receive.
 *
 * Pure and total: it copies the allow-listed fields and nothing else, so the answer to
 * "what leaves the process?" is one function that can be read in a minute and asserted
 * in a test. The arrays are copied rather than passed through, so a caller holding the
 * live preferences object cannot mutate what was already sent.
 */
export function buildCompanionPayload(request: CompanionRequest): CompanionPayload {
  const { criteria, language, relaxationSteps = 0 } = request;

  return {
    persona: {
      genders: [...criteria.genders],
      ageMin: criteria.ageMin,
      ageMax: criteria.ageMax,
      countries: [...criteria.countries],
      regions: [...criteria.regions],
      cities: [...criteria.cities],
      languages: [...criteria.languages],
      relaxAllowed: criteria.relaxAllowed,
    },
    language: language ?? null,
    relaxationSteps,
  };
}
