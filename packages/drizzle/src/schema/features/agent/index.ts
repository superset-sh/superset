import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
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

export const agentMessageRoleEnum = pgEnum("agent_message_role", [
  "user",
  "assistant",
  "tool",
]);

// ============================================================================
// Types (JSONB)
// ============================================================================

export type ModelPreference = {
  fast?: string;
  default?: string;
  reasoning?: string;
  longContext?: string;
};

export type ToolCallRecord = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type ToolResultRecord = {
  toolCallId: string;
  result: unknown;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ThreadMetadata = {
  modelUsed?: string;
  tokenCount?: number;
};

// ============================================================================
// Tables
// ============================================================================

/** 에이전트 설정 */
export const agentAgents = pgTable(
  "agent_agents",
  {
    ...baseColumns(),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    avatar: text("avatar"),
    systemPrompt: text("system_prompt").notNull(),
    modelPreference: jsonb("model_preference").$type<ModelPreference>().default({}),
    enabledTools: text("enabled_tools").array().default([]),
    temperature: real("temperature").notNull().default(0.7),
    maxSteps: integer("max_steps").notNull().default(10),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("idx_agent_agents_slug").on(table.slug),
    index("idx_agent_agents_active").on(table.isActive),
  ]
);

/** 대화 스레드 */
export const agentThreads = pgTable(
  "agent_threads",
  {
    ...baseColumns(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentAgents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title"),
    summary: text("summary"),
    metadata: jsonb("metadata").$type<ThreadMetadata>().default({}),
    isPinned: boolean("is_pinned").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_agent_threads_user").on(table.userId),
    index("idx_agent_threads_agent").on(table.agentId),
    index("idx_agent_threads_last_message").on(table.lastMessageAt),
  ]
);

/** 메시지 */
export const agentMessages = pgTable(
  "agent_messages",
  {
    ...baseColumns(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => agentThreads.id, { onDelete: "cascade" }),
    role: agentMessageRoleEnum("role").notNull(),
    content: text("content"),
    toolCalls: jsonb("tool_calls").$type<ToolCallRecord[]>(),
    toolResults: jsonb("tool_results").$type<ToolResultRecord[]>(),
    modelId: text("model_id"),
    tokenUsage: jsonb("token_usage").$type<TokenUsage>(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_agent_messages_thread").on(table.threadId),
    index("idx_agent_messages_created").on(table.createdAt),
  ]
);

/** 사용 통계 */
export const agentUsageLogs = pgTable(
  "agent_usage_logs",
  {
    ...baseColumns(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentAgents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .references(() => agentThreads.id, { onDelete: "set null" }),
    modelId: text("model_id").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
  },
  (table) => [
    index("idx_agent_usage_agent_user").on(table.agentId, table.userId),
    index("idx_agent_usage_created").on(table.createdAt),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const agentAgentsRelations = relations(agentAgents, ({ one, many }) => ({
  createdBy: one(profiles, {
    fields: [agentAgents.createdById],
    references: [profiles.id],
  }),
  threads: many(agentThreads),
  usageLogs: many(agentUsageLogs),
}));

export const agentThreadsRelations = relations(agentThreads, ({ one, many }) => ({
  agent: one(agentAgents, {
    fields: [agentThreads.agentId],
    references: [agentAgents.id],
  }),
  user: one(profiles, {
    fields: [agentThreads.userId],
    references: [profiles.id],
  }),
  messages: many(agentMessages),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  thread: one(agentThreads, {
    fields: [agentMessages.threadId],
    references: [agentThreads.id],
  }),
}));

export const agentUsageLogsRelations = relations(agentUsageLogs, ({ one }) => ({
  agent: one(agentAgents, {
    fields: [agentUsageLogs.agentId],
    references: [agentAgents.id],
  }),
  user: one(profiles, {
    fields: [agentUsageLogs.userId],
    references: [profiles.id],
  }),
  thread: one(agentThreads, {
    fields: [agentUsageLogs.threadId],
    references: [agentThreads.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type AgentAgent = typeof agentAgents.$inferSelect;
export type NewAgentAgent = typeof agentAgents.$inferInsert;

export type AgentThread = typeof agentThreads.$inferSelect;
export type NewAgentThread = typeof agentThreads.$inferInsert;

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;

export type AgentUsageLog = typeof agentUsageLogs.$inferSelect;
export type NewAgentUsageLog = typeof agentUsageLogs.$inferInsert;
