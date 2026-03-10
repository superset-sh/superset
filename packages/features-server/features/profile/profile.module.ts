/**
 * Profile Feature - NestJS Module
 */

import { Module, OnModuleInit } from '@nestjs/common';

// Services
import { ProfileService } from './service/profile.service';

// Controllers
import { ProfileController } from './controller/profile.controller';
import { TermsController, TermsAdminController } from './controller/terms.controller';

// Router
import { injectProfileService } from './profile.router';

@Module({
  controllers: [ProfileController, TermsController, TermsAdminController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule implements OnModuleInit {
  constructor(private readonly profileService: ProfileService) {}

  onModuleInit() {
    // Inject service into tRPC router
    injectProfileService(this.profileService);
  }
}
