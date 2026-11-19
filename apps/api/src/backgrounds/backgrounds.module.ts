import { Module } from '@nestjs/common';

import { AdminGuard } from '../archive/admin.guard.js';
import { BackgroundsAdminController } from './backgrounds.admin.controller.js';
import { BackgroundsPublicController } from './backgrounds.public.controller.js';
import { BackgroundService } from './backgrounds.service.js';

/**
 * Decorative backgrounds for the advertising slots (docs/DECISIONS.md D23/D28).
 *
 * One module for the admin (upload/remove) and public (serve) surfaces, because they share
 * `BackgroundService`. The guard is provided here exactly as in `OwnerAdminModule`: it has
 * no state, and sharing one stateless guard object is cheaper than importing the archive
 * module for a class that reads only configuration.
 */
@Module({
  controllers: [BackgroundsAdminController, BackgroundsPublicController],
  providers: [BackgroundService, AdminGuard],
})
export class BackgroundsModule {}