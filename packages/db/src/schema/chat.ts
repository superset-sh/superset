import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

// ---------------------------------------------------------------------------
// session_hosts — session discovery + device assignment
//
// This table exists purely for discovery (Electric sync to clients for
// listing) and agent assignment (which device hosts which session).
// All session content (messages, title, config) lives in the durable stream.
// ---------------------------------------------------------------------------

export const sessionHosts = pgTable(
	"session_hosts",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		deviceId: text("device_id"),
		lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("session_hosts_org_idx").on(table.organizationId),
		index("session_hosts_created_by_idx").on(table.createdBy),
		index("session_hosts_last_active_idx").on(table.lastActiveAt),
		index("session_hosts_device_id_idx").on(table.deviceId),
	],
);

export type InsertSessionHost = typeof sessionHosts.$inferInsert;
export type SelectSessionHost = typeof sessionHosts.$inferSelect;
