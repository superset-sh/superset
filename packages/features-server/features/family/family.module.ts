/**
 * Family Feature - NestJS Module
 */

import { Module, OnModuleInit } from '@nestjs/common';

// Services
import { FamilyService } from './service/family.service';

// Controllers
import { FamilyController } from './controller/family.controller';

// Router
import { injectFamilyService } from './family.router';

@Module({
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule implements OnModuleInit {
  constructor(private readonly familyService: FamilyService) {}

  onModuleInit() {
    // Inject service into tRPC router
    injectFamilyService(this.familyService);
  }
}
