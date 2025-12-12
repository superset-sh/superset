import {
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { taskStatusEnumValues } from "./enums";

export const taskStatus = pgEnum("task_status", taskStatusEnumValues);

export const users = pgTable(
	"users",
	{
		id: uuid().primaryKey().defaultRandom(),
		clerkId: text("clerk_id").notNull().unique(),
		name: text().notNull(),
		email: text().notNull().unique(),
		avatarUrl: text("avatar_url"),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("users_email_idx").on(table.email),
		index("users_clerk_id_idx").on(table.clerkId),
		index("users_deleted_at_idx").on(table.deletedAt),
	],
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const organizations = pgTable(
	"organizations",
	{
		id: uuid().primaryKey().defaultRandom(),
		name: text().notNull(),
		slug: text().notNull().unique(),
		githubOrg: text("github_org"),
		avatarUrl: text("avatar_url"),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("organizations_slug_idx").on(table.slug)],
);

export type InsertOrganization = typeof organizations.$inferInsert;
export type SelectOrganization = typeof organizations.$inferSelect;

export const organizationMembers = pgTable(
	"organization_members",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("organization_members_organization_id_idx").on(table.organizationId),
		index("organization_members_user_id_idx").on(table.userId),
		unique("organization_members_unique").on(
			table.organizationId,
			table.userId,
		),
	],
);

export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type SelectOrganizationMember = typeof organizationMembers.$inferSelect;

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
		slug: text().notNull().unique(),
		title: text().notNull(),
		description: text(),
		status: taskStatus().notNull().default("planning"),

		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		assigneeId: uuid("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		creatorId: uuid("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		branch: text(),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("tasks_slug_idx").on(table.slug),
		index("tasks_repository_id_idx").on(table.repositoryId),
		index("tasks_organization_id_idx").on(table.organizationId),
		index("tasks_assignee_id_idx").on(table.assigneeId),
		index("tasks_creator_id_idx").on(table.creatorId),
		index("tasks_status_idx").on(table.status),
		index("tasks_created_at_idx").on(table.createdAt),
	],
);

export type InsertTask = typeof tasks.$inferInsert;
export type SelectTask = typeof tasks.$inferSelect;
