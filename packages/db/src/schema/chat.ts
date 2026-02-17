import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const agentDeviceTypeValues = [
	"desktop",
	"cloud-sandbox",
	"remote",
] as const;

export const agentDeviceType = pgEnum(
	"agent_device_type",
	agentDeviceTypeValues,
);

export const agentStatusValues = [
	"online",
	"offline",
	"generating",
	"aborting",
] as const;

export const agentStatus = pgEnum("agent_status", agentStatusValues);

export const sessionMemberRoleValues = [
	"owner",
	"member",
	"viewer",
] as const;

export const sessionMemberRole = pgEnum(
	"session_member_role",
	sessionMemberRoleValues,
);

// ---------------------------------------------------------------------------
// chat_sessions — persistent session metadata
// ---------------------------------------------------------------------------

export const chatSessions = pgTable(
	"chat_sessions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text(),
		lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("chat_sessions_org_idx").on(table.organizationId),
		index("chat_sessions_created_by_idx").on(table.createdBy),
		index("chat_sessions_last_active_idx").on(table.lastActiveAt),
	],
);

export type InsertChatSession = typeof chatSessions.$inferInsert;
export type SelectChatSession = typeof chatSessions.$inferSelect;

// ---------------------------------------------------------------------------
// session_agents — registered agent runtimes for a session
// ---------------------------------------------------------------------------

export const sessionAgents = pgTable(
	"session_agents",
	{
		id: uuid().primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		deviceId: text("device_id").notNull(),
		deviceType: agentDeviceType("device_type").notNull(),
		endpoint: text(),
		model: text().notNull(),
		capabilities: jsonb().$type<{
			filesystem?: boolean;
			sandbox?: boolean;
			web?: boolean;
		}>(),
		status: agentStatus().notNull().default("offline"),
		config: jsonb().$type<{
			cwd?: string;
			permissionMode?: string;
			thinkingEnabled?: boolean;
		}>(),
		registeredAt: timestamp("registered_at").notNull().defaultNow(),
		lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
	},
	(table) => [
		index("session_agents_session_idx").on(table.sessionId),
		unique("session_agents_session_device_unique").on(
			table.sessionId,
			table.deviceId,
		),
	],
);

export type InsertSessionAgent = typeof sessionAgents.$inferInsert;
export type SelectSessionAgent = typeof sessionAgents.$inferSelect;

// ---------------------------------------------------------------------------
// session_members — users who can see / participate in a session
// ---------------------------------------------------------------------------

export const sessionMembers = pgTable(
	"session_members",
	{
		sessionId: uuid("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: sessionMemberRole().notNull().default("owner"),
		joinedAt: timestamp("joined_at").notNull().defaultNow(),
	},
	(table) => [
		unique("session_members_unique").on(table.sessionId, table.userId),
		index("session_members_user_idx").on(table.userId),
	],
);

export type InsertSessionMember = typeof sessionMembers.$inferInsert;
export type SelectSessionMember = typeof sessionMembers.$inferSelect;
