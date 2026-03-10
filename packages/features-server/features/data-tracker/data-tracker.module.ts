import { Module, OnModuleInit } from '@nestjs/common';
import { DataTrackerAdminController, DataTrackerUserController } from './controller';
import { DataTrackerService } from './service/data-tracker.service';
import { injectDataTrackerService } from './data-tracker.router';

@Module({
  controllers: [DataTrackerAdminController, DataTrackerUserController],
  providers: [DataTrackerService],
  exports: [DataTrackerService],
})
export class DataTrackerModule implements OnModuleInit {
  constructor(private readonly dataTrackerService: DataTrackerService) {}

  onModuleInit() {
    // tRPC 서비스 주입
    injectDataTrackerService(this.dataTrackerService);
  }
}
