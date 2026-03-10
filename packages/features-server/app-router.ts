/**
 * App Router Type — 전체 tRPC 라우터 타입 정의
 *
 * 모든 feature 라우터를 하나로 조합하여 타입을 생성합니다.
 * 클라이언트: 타입만 import하여 사용
 * 서버: 이 파일의 개별 라우터를 import하여 직접 조립
 */
import { router } from "./core/trpc";
import { agentDeskRouter } from "./features/agent-desk";
import { aiRouter } from "./features/ai";
import { aiImageRouter } from "./features/ai-image";
import { analyticsRouter } from "./features/analytics";
import { auditLogRouter } from "./features/audit-log";
import { blogRouter } from "./features/blog";
import { boardRouter } from "./features/board";
import { bookingMainRouter } from "./features/booking";
import { bookmarkRouter } from "./features/bookmark";
import { commentRouter } from "./features/comment";
import { communityMainRouter } from "./features/community";
import { contentStudioRouter } from "./features/content-studio";
import { couponRouter } from "./features/coupon";
import { courseRouter } from "./features/course";
import { dataTrackerRouter } from "./features/data-tracker";
import { emailRouter } from "./features/email";
import { familyRouter } from "./features/family";
import { fileManagerRouter } from "./features/file-manager";
import { helloWorldRouter } from "./features/hello-world";
import { marketingMainRouter } from "./features/marketing";
import { notificationRouter } from "./features/notification";
import { paymentRouter } from "./features/payment";
import { profileRouter } from "./features/profile";
import { reactionRouter } from "./features/reaction";
import { reviewRouter } from "./features/review";
import { rolePermissionRouter } from "./features/role-permission";
import { scheduledJobRouter } from "./features/scheduled-job";
import { storyStudioRouter } from "./features/story-studio";
import { taskRouter } from "./features/task";
import { featureCatalogRouter } from "./features/feature-catalog";

// 내부 전용 — 타입 추출용 (값은 export하지 않음)
const _appRouter = router({
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
});

/** 전체 앱 라우터 타입 — 클라이언트에서 import하여 사용 */
export type AppRouter = typeof _appRouter;
