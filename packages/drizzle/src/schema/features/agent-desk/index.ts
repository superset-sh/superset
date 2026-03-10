import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";

// ============================================================================
// Enums
// ============================================================================

export const agentDeskSessionTypeEnum = pgEnum("agent_desk_session_type", ["customer", "operator", "designer"]);

export const agentDeskSessionStatusEnum = pgEnum("agent_desk_session_status", [
  "chatting",
  "uploading",
  "parsing",
  "designing",
  "analyzing",
  "analyzed",
  "reviewed",
  "spec_generated",
  "project_created",
  "executing",
  "executed",
  "failed",
]);

export const agentDeskMessageRoleEnum = pgEnum("agent_desk_message_role", ["agent", "user"]);

export const agentDeskExecutionStatusEnum = pgEnum("agent_desk_execution_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const agentDeskSourceTypeEnum = pgEnum("agent_desk_source_type", [
  "pdf", "pptx", "docx", "md", "txt", "manual",
]);

export const agentDeskParseStatusEnum = pgEnum("agent_desk_parse_status", [
  "pending", "parsed", "failed",
]);

export const agentDeskRequirementCategoryEnum = pgEnum("agent_desk_requirement_category", [
  "feature", "role", "entity", "validation", "exception",
]);

export const agentDeskConflictStatusEnum = pgEnum("agent_desk_conflict_status", [
  "none", "duplicate", "conflict",
]);

export const agentDeskPublishStatusEnum = pgEnum("agent_desk_publish_status", [
  "drafted", "publishing", "partially_published", "published", "failed",
]);

// ============================================================================
// Tables
// ============================================================================

export const agentDeskSessions = pgTable("agent_desk_sessions", {
  ...baseColumns(),
  type: agentDeskSessionTypeEnum("type").notNull(),
  status: agentDeskSessionStatusEnum("status").notNull().default("chatting"),
  title: varchar("title", { length: 200 }),
  prompt: text("prompt"),
  analysisResult: jsonb("analysis_result"),
  diagrams: jsonb("diagrams"),
  spec: text("spec"),
  errorMessage: text("error_message"),
  // --- Flow Designer 전용 컬럼 ---
  platform: varchar("platform", { length: 20 }),
  designTheme: text("design_theme"),
  flowData: jsonb("flow_data"),
  metadata: jsonb("metadata"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
});

export const agentDeskFiles = pgTable("agent_desk_files", {
  ...baseColumns(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentDeskSessions.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  originalName: varchar("original_name", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: integer("size").notNull(),
  storageUrl: text("storage_url").notNull(),
  parsedContent: text("parsed_content"),
  parsedAt: timestamp("parsed_at", { withTimezone: true }),
});

export const agentDeskMessages = pgTable("agent_desk_messages", {
  ...baseColumns(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentDeskSessions.id, { onDelete: "cascade" }),
  role: agentDeskMessageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  feedback: varchar("feedback", { length: 10 }),
  feedbackAt: timestamp("feedback_at", { withTimezone: true }),
});

export const agentDeskExecutions = pgTable("agent_desk_executions", {
  ...baseColumns(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentDeskSessions.id, { onDelete: "cascade" }),
  worktreePath: text("worktree_path"),
  branchName: varchar("branch_name", { length: 200 }),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  status: agentDeskExecutionStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  log: text("log"),
});

export const agentDeskRequirementSources = pgTable("agent_desk_requirement_sources", {
  ...baseColumns(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentDeskSessions.id, { onDelete: "cascade" }),
  sourceType: agentDeskSourceTypeEnum("source_type").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  rawContent: text("raw_content"),
  parsedContent: text("parsed_content"),
  priority: integer("priority").notNull().default(3),
  trustScore: integer("trust_score").notNull().default(100),
  parseStatus: agentDeskParseStatusEnum("parse_status").notNull().default("pending"),
  fileId: uuid("file_id").references(() => agentDeskFiles.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
});

export const agentDeskNormalizedRequirements = pgTable("agent_desk_normalized_requirements", {
  ...baseColumns(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentDeskSessions.id, { onDelete: "cascade" }),
  category: agentDeskRequirementCategoryEnum("category").notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  detail: text("detail"),
  sourceIds: text("source_ids").array(),
  confidence: integer("confidence").notNull().default(80),
  conflictStatus: agentDeskConflictStatusEnum("conflict_status").notNull().default("none"),
  dedupeGroupId: uuid("dedupe_group_id"),
});

export const agentDeskLinearPublishJobs = pgTable("agent_desk_linear_publish_jobs", {
  ...baseColumns(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => agentDeskSessions.id, { onDelete: "cascade" }),
  handoffVersion: integer("handoff_version").notNull(),
  draftKey: varchar("draft_key", { length: 500 }).notNull(),
  status: agentDeskPublishStatusEnum("status").notNull().default("drafted"),
  teamKey: varchar("team_key", { length: 50 }).notNull(),
  projectId: varchar("project_id", { length: 200 }),
  projectName: varchar("project_name", { length: 500 }),
  groupingMode: varchar("grouping_mode", { length: 50 }).notNull().default("story-to-issue"),
  draftPayload: jsonb("draft_payload"),
  createdIssues: jsonb("created_issues"),
  failedIssues: jsonb("failed_issues"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  errorMessage: text("error_message"),
});

// ============================================================================
// Relations
// ============================================================================

export const agentDeskSessionsRelations = relations(agentDeskSessions, ({ one, many }) => ({
  createdBy: one(profiles, {
    fields: [agentDeskSessions.createdById],
    references: [profiles.id],
  }),
  files: many(agentDeskFiles),
  messages: many(agentDeskMessages),
  executions: many(agentDeskExecutions),
  requirementSources: many(agentDeskRequirementSources),
  normalizedRequirements: many(agentDeskNormalizedRequirements),
  linearPublishJobs: many(agentDeskLinearPublishJobs),
}));

export const agentDeskFilesRelations = relations(agentDeskFiles, ({ one }) => ({
  session: one(agentDeskSessions, {
    fields: [agentDeskFiles.sessionId],
    references: [agentDeskSessions.id],
  }),
}));

export const agentDeskMessagesRelations = relations(agentDeskMessages, ({ one }) => ({
  session: one(agentDeskSessions, {
    fields: [agentDeskMessages.sessionId],
    references: [agentDeskSessions.id],
  }),
}));

export const agentDeskExecutionsRelations = relations(agentDeskExecutions, ({ one }) => ({
  session: one(agentDeskSessions, {
    fields: [agentDeskExecutions.sessionId],
    references: [agentDeskSessions.id],
  }),
}));

export const agentDeskRequirementSourcesRelations = relations(agentDeskRequirementSources, ({ one }) => ({
  session: one(agentDeskSessions, {
    fields: [agentDeskRequirementSources.sessionId],
    references: [agentDeskSessions.id],
  }),
  file: one(agentDeskFiles, {
    fields: [agentDeskRequirementSources.fileId],
    references: [agentDeskFiles.id],
  }),
}));

export const agentDeskNormalizedRequirementsRelations = relations(agentDeskNormalizedRequirements, ({ one }) => ({
  session: one(agentDeskSessions, {
    fields: [agentDeskNormalizedRequirements.sessionId],
    references: [agentDeskSessions.id],
  }),
}));

export const agentDeskLinearPublishJobsRelations = relations(agentDeskLinearPublishJobs, ({ one }) => ({
  session: one(agentDeskSessions, {
    fields: [agentDeskLinearPublishJobs.sessionId],
    references: [agentDeskSessions.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type AgentDeskSession = typeof agentDeskSessions.$inferSelect;
export type NewAgentDeskSession = typeof agentDeskSessions.$inferInsert;

export type AgentDeskFile = typeof agentDeskFiles.$inferSelect;
export type NewAgentDeskFile = typeof agentDeskFiles.$inferInsert;

export type AgentDeskMessage = typeof agentDeskMessages.$inferSelect;
export type NewAgentDeskMessage = typeof agentDeskMessages.$inferInsert;

export type AgentDeskExecution = typeof agentDeskExecutions.$inferSelect;
export type NewAgentDeskExecution = typeof agentDeskExecutions.$inferInsert;

export type AgentDeskRequirementSource = typeof agentDeskRequirementSources.$inferSelect;
export type NewAgentDeskRequirementSource = typeof agentDeskRequirementSources.$inferInsert;

export type AgentDeskNormalizedRequirement = typeof agentDeskNormalizedRequirements.$inferSelect;
export type NewAgentDeskNormalizedRequirement = typeof agentDeskNormalizedRequirements.$inferInsert;

export type AgentDeskLinearPublishJob = typeof agentDeskLinearPublishJobs.$inferSelect;
export type NewAgentDeskLinearPublishJob = typeof agentDeskLinearPublishJobs.$inferInsert;
