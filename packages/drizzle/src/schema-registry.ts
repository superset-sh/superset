/**
 * Schema Registry
 *
 * Combines all schemas into a single object for Drizzle query API
 */
import * as auth from "./schema/core/auth";
import * as files from "./schema/core/files";
import * as profiles from "./schema/core/profiles";
import * as reviews from "./schema/core/reviews";
import * as rolePermission from "./schema/core/role-permission";
import * as agentDesk from "./schema/features/agent-desk";
import * as aiImage from "./schema/features/ai-image";
import * as analytics from "./schema/features/analytics";
import * as auditLog from "./schema/features/audit-log";
import * as board from "./schema/features/board";
import * as comment from "./schema/features/comment";
import * as community from "./schema/features/community";
import * as contentStudio from "./schema/features/content-studio";
import * as dataTracker from "./schema/features/data-tracker";
import * as email from "./schema/features/email";
import * as family from "./schema/features/family";
import * as notification from "./schema/features/notification";
import * as payment from "./schema/features/payment";
import * as reaction from "./schema/features/reaction";
import * as scheduledJob from "./schema/features/scheduled-job";
import * as storyStudio from "./schema/features/story-studio";
import * as task from "./schema/features/task";
import * as featureCatalog from "./schema/features/feature-catalog";

export const schema = {
  // Core
  ...auth,
  ...profiles,
  ...files,
  ...reviews,
  ...rolePermission,
  // Features
  ...board,
  ...comment,
  ...community,
  ...email,
  ...notification,
  ...payment,
  ...reaction,
  // System (ops)
  ...scheduledJob,
  ...auditLog,
  ...analytics,
  // Content
  ...contentStudio,
  // Data
  ...dataTracker,
  // Family
  ...family,
  // Agent Desk
  ...agentDesk,
  // AI Image
  ...aiImage,
  // Task
  ...task,
  // Story Studio
  ...storyStudio,
  // Feature Catalog
  ...featureCatalog,
};

export type Schema = typeof schema;
