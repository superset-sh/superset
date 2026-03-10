import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '@superbuilder/drizzle';

// [ATLAS:IMPORTS]
import { HelloWorldModule } from '@superbuilder/features-server/hello-world';
import { CommentModule } from '@superbuilder/features-server/comment';
import { BoardModule } from '@superbuilder/features-server/board';
import { FileManagerModule } from '@superbuilder/features-server/file-manager';
import { ReviewModule } from '@superbuilder/features-server/review';
import { CommunityModule } from '@superbuilder/features-server/community';
import { PaymentModule } from '@superbuilder/features-server/payment';
import { ProfileModule } from '@superbuilder/features-server/profile';
import { RolePermissionModule } from '@superbuilder/features-server/role-permission';
import { EmailModule } from '@superbuilder/features-server/email';
import { NotificationModule } from '@superbuilder/features-server/notification';
import { ReactionModule } from '@superbuilder/features-server/reaction';
import { AIModule } from '@superbuilder/features-server/ai';
import { MarketingModule } from '@superbuilder/features-server/marketing';
import { ScheduledJobModule } from '@superbuilder/features-server/scheduled-job';
import { AuditLogModule } from '@superbuilder/features-server/audit-log';
import { AnalyticsModule } from '@superbuilder/features-server/analytics';
import { ContentStudioModule } from '@superbuilder/features-server/content-studio';
import { CourseModule } from '@superbuilder/features-server/course';
import { BookingModule } from '@superbuilder/features-server/booking';
import { DataTrackerModule } from '@superbuilder/features-server/data-tracker';
import { FamilyModule } from '@superbuilder/features-server/family';
import { AgentDeskModule } from '@superbuilder/features-server/agent-desk';
import { AiImageModule } from '@superbuilder/features-server/ai-image';
import { TaskModule } from '@superbuilder/features-server/task';
import { BlogModule } from '@superbuilder/features-server/blog';
import { NaverAuthModule } from '@superbuilder/features-server/naver-auth';
import { StoryStudioModule } from '@superbuilder/features-server/story-studio';
import { CouponModule } from '@superbuilder/features-server/coupon';
import { BookmarkModule } from '@superbuilder/features-server/bookmark';
import { FeatureCatalogModule } from '@superbuilder/features-server/feature-catalog';
// [/ATLAS:IMPORTS]

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.local', '../../.env'],
    }),
    // Rate Limiting — 60초당 100회 (전역)
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
    }),
    DatabaseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        connectionString:
          configService.get<string>('DATABASE_URL') ??
          'postgresql://postgres:postgres@localhost:5432/atlas',
      }),
      inject: [ConfigService],
    }),
    // [ATLAS:MODULES]
    HelloWorldModule,
    CommentModule,
    BoardModule,
    FileManagerModule,
    ReviewModule,
    CommunityModule,
    PaymentModule,
    ProfileModule,
    RolePermissionModule,
    EmailModule,
    NotificationModule,
    ReactionModule,
    AIModule,
    MarketingModule,
    ScheduledJobModule,
    AuditLogModule,
    AnalyticsModule,
    ContentStudioModule,
    CourseModule,
    BookingModule,
    DataTrackerModule,
    FamilyModule,
    AgentDeskModule,
    AiImageModule,
    TaskModule,
    BlogModule,
    NaverAuthModule,
    StoryStudioModule,
    CouponModule,
    BookmarkModule,
    FeatureCatalogModule,
    // [/ATLAS:MODULES]
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard 전역 적용
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
