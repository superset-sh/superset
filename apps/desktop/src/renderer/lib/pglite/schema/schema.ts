import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// =============================================================================
// Enums
// =============================================================================

export const taskPriority = pgEnum("task_priority", [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
]);

export const integrationProvider = pgEnum("integration_provider", [
	"linear",
	"github",
]);

// =============================================================================
// Synced tables - column names match Postgres exactly (snake_case)
// so Electric sync writes directly and raw SQL queries work
// =============================================================================

export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey(),
		clerk_id: text("clerk_id").notNull().unique(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		avatar_url: text("avatar_url"),
		deleted_at: timestamp("deleted_at"),
		created_at: timestamp("created_at").notNull(),
		updated_at: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("users_email_idx").on(table.email),
		index("users_clerk_id_idx").on(table.clerk_id),
	],
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const organizations = pgTable(
	"organizations",
	{
		id: uuid("id").primaryKey(),
		clerk_org_id: text("clerk_org_id").unique(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		github_org: text("github_org"),
		avatar_url: text("avatar_url"),
		created_at: timestamp("created_at").notNull(),
		updated_at: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("organizations_slug_idx").on(table.slug),
		index("organizations_clerk_org_id_idx").on(table.clerk_org_id),
	],
);

export type InsertOrganization = typeof organizations.$inferInsert;
export type SelectOrganization = typeof organizations.$inferSelect;

export const organizationMembers = pgTable(
	"organization_members",
	{
		id: uuid("id").primaryKey(),
		organization_id: uuid("organization_id").notNull(),
		user_id: uuid("user_id").notNull(),
		role: text("role").notNull(),
		created_at: timestamp("created_at").notNull(),
	},
	(table) => [
		index("organization_members_organization_id_idx").on(table.organization_id),
		index("organization_members_user_id_idx").on(table.user_id),
		unique("organization_members_unique").on(
			table.organization_id,
			table.user_id,
		),
	],
);

export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type SelectOrganizationMember = typeof organizationMembers.$inferSelect;

export const tasks = pgTable(
	"tasks",
	{
		id: uuid("id").primaryKey(),
		slug: text("slug").notNull().unique(),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status").notNull(),
		status_color: text("status_color"),
		status_type: text("status_type"),
		status_position: real("status_position"),
		priority: taskPriority("priority").notNull().default("none"),
		organization_id: uuid("organization_id").notNull(),
		repository_id: uuid("repository_id"),
		assignee_id: uuid("assignee_id"),
		creator_id: uuid("creator_id").notNull(),
		estimate: integer("estimate"),
		due_date: timestamp("due_date"),
		labels: jsonb("labels").$type<string[]>(),
		branch: text("branch"),
		pr_url: text("pr_url"),
		external_provider: integrationProvider("external_provider"),
		external_id: text("external_id"),
		external_key: text("external_key"),
		external_url: text("external_url"),
		last_synced_at: timestamp("last_synced_at"),
		sync_error: text("sync_error"),
		started_at: timestamp("started_at"),
		completed_at: timestamp("completed_at"),
		deleted_at: timestamp("deleted_at"),
		created_at: timestamp("created_at").notNull(),
		updated_at: timestamp("updated_at").notNull(),
	},
	(table) => [
		index("tasks_slug_idx").on(table.slug),
		index("tasks_organization_id_idx").on(table.organization_id),
		index("tasks_assignee_id_idx").on(table.assignee_id),
		index("tasks_status_idx").on(table.status),
		index("tasks_created_at_idx").on(table.created_at),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;
export type TaskPriority = (typeof taskPriority.enumValues)[number];
export type IntegrationProvider =
	(typeof integrationProvider.enumValues)[number];

// =============================================================================
// Local-only tables (not synced via Electric)
// =============================================================================

export const localSettings = pgTable("local_settings", {
	id: integer("id").primaryKey().default(1),
	active_organization_id: uuid("active_organization_id"),
});

export type InsertLocalSettings = typeof localSettings.$inferInsert;
export type SelectLocalSettings = typeof localSettings.$inferSelect;
