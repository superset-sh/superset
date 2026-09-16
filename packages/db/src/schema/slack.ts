import { sql } from "drizzle-orm";
import {
	boolean,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";

/** Something the agent made in a thread, kept so later turns can refer to it. */
export interface SlackThreadEntity {
	kind: "task" | "workspace" | "agent" | "issue" | "pr";
	id: string;
	label: string;
	url?: string;
	at: string;
	/** Position within the run that created it; `at` alone ties within a run. */
	seq: number;
}

export interface SlackQueuedFile {
	id: string;
	name?: string;
	mimetype?: string;
	size?: number;
	url_private?: string;
	url_private_download?: string;
}

/** A follow-up that arrived while the thread's agent was mid-turn. */
export interface SlackQueuedEvent {
	ts: string;
	user: string;
	text: string;
	files?: SlackQueuedFile[];
}

/**
 * One row per Slack thread the agent has replied in. The thread is the
 * durable session: replies reach the agent without a mention, and the
 * entity log is what lets "that workspace" resolve on a later turn. Slack
 * content is not stored here beyond ids, timestamps and the labels of things
 * the agent created. Keyed by organization as well as thread: a Slack team
 * can be disconnected and connected by another organization, which must not
 * inherit the previous one's log.
 */
export const slackThreadSessions = pgTable(
	"slack_thread_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		teamId: text("team_id").notNull(),
		channelId: text("channel_id").notNull(),
		threadTs: text("thread_ts").notNull(),
		startedByUserId: uuid("started_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),

		status: text().notNull().default("idle"), // idle | running
		quiet: boolean().notNull().default(false),
		lastContextTs: text("last_context_ts"),
		entityLog: jsonb("entity_log")
			.$type<SlackThreadEntity[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		queuedEvents: jsonb("queued_events")
			.$type<SlackQueuedEvent[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),

		lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		unique("slack_thread_sessions_thread_unique").on(
			t.organizationId,
			t.teamId,
			t.channelId,
			t.threadTs,
		),
	],
);

export type InsertSlackThreadSession = typeof slackThreadSessions.$inferInsert;
export type SelectSlackThreadSession = typeof slackThreadSessions.$inferSelect;
