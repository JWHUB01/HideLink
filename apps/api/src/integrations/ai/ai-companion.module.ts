import { Module } from '@nestjs/common';

import { NoAiCompanionProvider } from './ai-companion.provider.none.js';
import { AiCompanionService } from './ai-companion.service.js';
import { AI_COMPANION_PROVIDER } from './ai-companion.types.js';

/**
 * The seam that will hold the neural-network companion.
 *
 * Today it binds {@link NoAiCompanionProvider}, so the seam is inert: the owner switch
 * in `/admin` is stored, and no request can leave the process (`docs/DECISIONS.md` D38
 * §4). A future provider integration adds its client here — a new `useClass`/`useFactory`
 * for `AI_COMPANION_PROVIDER` — without touching the chat domain or the protocol.
 *
 * `PlatformService` and `AppConfig` are global (`PlatformModule`, `ConfigModule`), so
 * this module imports nothing and stays a leaf. Registering it now keeps the DI graph
 * honest: the service is constructed and available at boot, which is what makes the
 * eventual switch-on a configuration change rather than a wiring change.
 */
@Module({
  providers: [
    AiCompanionService,
    { provide: AI_COMPANION_PROVIDER, useClass: NoAiCompanionProvider },
  ],
  exports: [AiCompanionService],
})
export class AiCompanionModule {}
