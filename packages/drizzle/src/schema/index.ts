/**
 * Centralized Schema Exports
 *
 * All schemas are organized by folder:
 * - Core schemas: packages/drizzle/src/schema/core/
 * - Feature schemas: packages/drizzle/src/schema/features/{feature-name}/
 *
 * Each feature is independently managed to minimize cross-dependencies.
 * Features should avoid directly referencing other feature schemas.
 */

// Core Schemas (base tables that features depend on)
export * from "./core/auth";
export * from "./core/profiles";
export * from "./core/files";
export * from "./core/reviews";
export * from "./core/role-permission";
export * from "./core/rate-limits";
export * from "./core/terms";

// Feature Schemas (organized by folder)
export * from "./features/board";
export * from "./features/comment";
export * from "./features/community";
export * from "./features/email";
export * from "./features/notification";
export * from "./features/payment";
export * from "./features/reaction";
export * from "./features/agent";
export * from "./features/marketing";
export * from "./features/scheduled-job";
export * from "./features/audit-log";
export * from "./features/analytics";
export * from "./features/content-studio";
export * from "./features/course";
export * from "./features/booking";
export * from "./features/data-tracker";
export * from "./features/profile";
export * from "./features/family";
export * from "./features/agent-desk";
export * from "./features/ai-image";
export * from "./features/task";
export * from "./features/blog";
export * from "./features/story-studio";
export * from "./features/bookmark";
export * from "./features/feature-catalog";
