import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import { repositories } from "./schema";

export const chatParticipantRoleValues = ["owner", "editor", "viewer"] as const;
export type ChatParticipantRole = (typeof chatParticipantRoleValues)[number];
export const chatParticipantRole = pgEnum(
	"chat_participant_role",
	chatParticipantRoleValues,
);

export const chatMessageRoleValues = ["user", "assistant"] as const;
export type ChatMessageRole = (typeof chatMessageRoleValues)[number];
export const chatMessageRole = pgEnum(
	"chat_message_role",
	chatMessageRoleValues,
);

// Chat sessions - org-scoped
export const chatSessions = pgTable(
	"chat_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repositoryId: uuid("repository_id").references(() => repositories.id, {
			onDelete: "set null",
		}),
		workspaceId: text("workspace_id"),
		title: text().notNull(),
		claudeSessionId: text("claude_session_id"), // For resume
		cwd: text(), // Working directory
		createdById: uuid("created_by_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		archivedAt: timestamp("archived_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("chat_sessions_organization_id_idx").on(table.organizationId),
		index("chat_sessions_repository_id_idx").on(table.repositoryId),
		index("chat_sessions_workspace_id_idx").on(table.workspaceId),
		index("chat_sessions_created_by_id_idx").on(table.createdById),
		index("chat_sessions_created_at_idx").on(table.createdAt),
	],
);

export type InsertChatSession = typeof chatSessions.$inferInsert;
export type SelectChatSession = typeof chatSessions.$inferSelect;

// Completed messages only (not streaming tokens)
export const chatMessages = pgTable(
	"chat_messages",
	{
		id: uuid().primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		role: chatMessageRole().notNull(),
		content: text().notNull(),
		toolCalls: jsonb("tool_calls"),
		inputTokens: integer("input_tokens"),
		outputTokens: integer("output_tokens"),
		createdById: uuid("created_by_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("chat_messages_session_id_idx").on(table.sessionId),
		index("chat_messages_organization_id_idx").on(table.organizationId),
		index("chat_messages_created_at_idx").on(table.createdAt),
	],
);

export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type SelectChatMessage = typeof chatMessages.$inferSelect;

// Who can access each session
export const chatParticipants = pgTable(
	"chat_participants",
	{
		id: uuid().primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: chatParticipantRole().notNull().default("viewer"),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
	},
	(table) => [
		index("chat_participants_session_id_idx").on(table.sessionId),
		index("chat_participants_user_id_idx").on(table.userId),
		unique("chat_participants_session_user_unique").on(
			table.sessionId,
			table.userId,
		),
	],
);

export type InsertChatParticipant = typeof chatParticipants.$inferInsert;
export type SelectChatParticipant = typeof chatParticipants.$inferSelect;
