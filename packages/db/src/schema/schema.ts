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

import { organizations, users } from "./auth";
import {
	integrationProviderValues,
	taskPriorityValues,
	taskStatusEnumValues,
} from "./enums";
import type { IntegrationConfig } from "./types";

export const taskStatus = pgEnum("task_status", taskStatusEnumValues);
export const taskPriority = pgEnum("task_priority", taskPriorityValues);
export const integrationProvider = pgEnum(
	"integration_provider",
	integrationProviderValues,
);

export const repositories = pgTable(
	"repositories",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		slug: text().notNull(),
		repoUrl: text("repo_url").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		defaultBranch: text("default_branch").notNull().default("main"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("repositories_organization_id_idx").on(table.organizationId),
		index("repositories_slug_idx").on(table.slug),
		unique("repositories_org_slug_unique").on(table.organizationId, table.slug),
	],
);

export type InsertRepository = typeof repositories.$inferInsert;
export type SelectRepository = typeof repositories.$inferSelect;

export const tasks = pgTable(
	"tasks",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Core fields
		slug: text().notNull().unique(),
		title: text().notNull(),
		description: text(),
		status: text().notNull(), // Flexible text - stores any status name
		statusColor: text("status_color"),
		statusType: text("status_type"),
		statusPosition: real("status_position"),
		priority: taskPriority().notNull().default("none"),

		// Ownership
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repositoryId: uuid("repository_id").references(() => repositories.id, {
			onDelete: "cascade",
		}),
		assigneeId: uuid("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Planning
		estimate: integer(),
		dueDate: timestamp("due_date"),
		labels: jsonb().$type<string[]>().default([]),

		// Git/Work tracking
		branch: text(),
		prUrl: text("pr_url"),

		// External sync (null if local-only task)
		externalProvider: integrationProvider("external_provider"),
		externalId: text("external_id"),
		externalKey: text("external_key"), // "SUPER-172", "#123"
		externalUrl: text("external_url"),
		lastSyncedAt: timestamp("last_synced_at"),
		syncError: text("sync_error"),

		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
		deletedAt: timestamp("deleted_at"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("tasks_slug_idx").on(table.slug),
		index("tasks_organization_id_idx").on(table.organizationId),
		index("tasks_repository_id_idx").on(table.repositoryId),
		index("tasks_assignee_id_idx").on(table.assigneeId),
		index("tasks_creator_id_idx").on(table.creatorId),
		index("tasks_status_idx").on(table.status),
		index("tasks_created_at_idx").on(table.createdAt),
		index("tasks_external_provider_idx").on(table.externalProvider),
		unique("tasks_external_unique").on(
			table.externalProvider,
			table.externalId,
		),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;

// Integration connections for external providers (Linear, GitHub, etc.)
export const integrationConnections = pgTable(
	"integration_connections",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		connectedByUserId: uuid("connected_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		provider: integrationProvider().notNull(),

		// OAuth tokens
		accessToken: text("access_token").notNull(),
		refreshToken: text("refresh_token"),
		tokenExpiresAt: timestamp("token_expires_at"),

		externalOrgId: text("external_org_id"),
		externalOrgName: text("external_org_name"),

		config: jsonb().$type<IntegrationConfig>(),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("integration_connections_unique").on(
			table.organizationId,
			table.provider,
		),
		index("integration_connections_org_idx").on(table.organizationId),
	],
);

export type InsertIntegrationConnection =
	typeof integrationConnections.$inferInsert;
export type SelectIntegrationConnection =
	typeof integrationConnections.$inferSelect;
