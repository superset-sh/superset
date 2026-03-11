/**
 * tRPC App Router
 *
 * 모든 feature 라우터를 packages/features에서 import하여 조립합니다.
 * 타입은 @superbuilder/features/app-router의 AppRouter를 사용합니다.
 */
import { router } from '@superbuilder/features-server/core/trpc';
import { helloWorldRouter } from '@superbuilder/features-server/hello-world';
import { commentRouter } from '@superbuilder/features-server/comment';
import { boardRouter } from '@superbuilder/features-server/board';
import { reviewRouter } from '@superbuilder/features-server/review';
import { communityMainRouter } from '@superbuilder/features-server/community';
import { paymentRouter } from '@superbuilder/features-server/payment';
import { profileRouter } from '@superbuilder/features-server/profile';
import { notificationRouter } from '@superbuilder/features-server/notification';
import { reactionRouter } from '@superbuilder/features-server/reaction';
import { rolePermissionRouter } from '@superbuilder/features-server/role-permission';
import { emailRouter } from '@superbuilder/features-server/email';
import { aiRouter } from '@superbuilder/features-server/ai';
import { marketingMainRouter } from '@superbuilder/features-server/marketing';
import { scheduledJobRouter } from '@superbuilder/features-server/scheduled-job';
import { auditLogRouter } from '@superbuilder/features-server/audit-log';
import { analyticsRouter } from '@superbuilder/features-server/analytics';
import { contentStudioRouter } from '@superbuilder/features-server/content-studio';
import { fileManagerRouter } from '@superbuilder/features-server/file-manager';
import { courseRouter } from '@superbuilder/features-server/course';
import { bookingMainRouter } from '@superbuilder/features-server/booking';
import { dataTrackerRouter } from '@superbuilder/features-server/data-tracker';
import { familyRouter } from '@superbuilder/features-server/family';
import { agentDeskRouter } from '@superbuilder/features-server/agent-desk';
import { aiImageRouter } from '@superbuilder/features-server/ai-image';
import { taskRouter } from '@superbuilder/features-server/task';
import { blogRouter } from '@superbuilder/features-server/blog';
import { storyStudioRouter } from '@superbuilder/features-server/story-studio';
import { couponRouter } from '@superbuilder/features-server/coupon';
import { bookmarkRouter } from '@superbuilder/features-server/bookmark';
import { featureCatalogRouter } from '@superbuilder/features-server/feature-catalog';
import { featureStudioRouter } from '@superbuilder/features-server/feature-studio';
import type { AppRouter } from '@superbuilder/features-server/app-router';

export const trpcRouter: AppRouter = router({
  helloWorld: helloWorldRouter,
  comment: commentRouter,
  board: boardRouter,
  review: reviewRouter,
  community: communityMainRouter,
  payment: paymentRouter,
  profile: profileRouter,
  notification: notificationRouter,
  reaction: reactionRouter,
  rolePermission: rolePermissionRouter,
  email: emailRouter,
  ai: aiRouter,
  marketing: marketingMainRouter,
  scheduledJob: scheduledJobRouter,
  auditLog: auditLogRouter,
  analytics: analyticsRouter,
  contentStudio: contentStudioRouter,
  fileManager: fileManagerRouter,
  course: courseRouter,
  booking: bookingMainRouter,
  dataTracker: dataTrackerRouter,
  family: familyRouter,
  agentDesk: agentDeskRouter,
  aiImage: aiImageRouter,
  task: taskRouter,
  blog: blogRouter,
  storyStudio: storyStudioRouter,
  coupon: couponRouter,
  bookmark: bookmarkRouter,
  featureCatalog: featureCatalogRouter,
  featureStudio: featureStudioRouter,
}) as AppRouter;

export type TrpcRouter = AppRouter;
