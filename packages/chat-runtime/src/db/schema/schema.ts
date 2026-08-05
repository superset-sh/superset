import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const CHAT_DB_FILENAME = "chat.db";

export const chatJournal = sqliteTable(
	"chat_journal",
	{
		sessionId: text("session_id").notNull(),
		epoch: text().notNull(),
		seq: integer().notNull(),
		ts: integer().notNull(),
		eventJson: text("event_json").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.sessionId, table.epoch, table.seq] }),
	],
);

export const chatSessionsLocal = sqliteTable(
	"chat_sessions_local",
	{
		sessionId: text("session_id").primaryKey(),
		scopeId: text("scope_id").notNull(),
		harness: text().notNull(),
		harnessSessionId: text("harness_session_id"),
		epoch: text().notNull(),
		status: text().notNull(),
		title: text(),
		queuedCount: integer("queued_count").notNull().default(0),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("chat_sessions_local_scope_id_idx").on(table.scopeId)],
);

export type JournalRow = typeof chatJournal.$inferSelect;
export type ChatSessionRow = typeof chatSessionsLocal.$inferSelect;
