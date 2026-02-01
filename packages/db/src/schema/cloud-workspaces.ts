import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";
import {
	cloudModelValues,
	cloudSandboxStatusValues,
	cloudSessionStatusValues,
} from "./enums";
import { repositories } from "./schema";

export const cloudSessionStatus = pgEnum(
	"cloud_session_status",
	cloudSessionStatusValues,
);
export const cloudSandboxStatus = pgEnum(
	"cloud_sandbox_status",
	cloudSandboxStatusValues,
);
export const cloudModel = pgEnum("cloud_model", cloudModelValues);

export const cloudWorkspaces = pgTable(
	"cloud_workspaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Session identity (maps to Durable Object name)
		sessionId: text("session_id").notNull().unique(),
		title: text().notNull(),

		// Repository info
		repositoryId: uuid("repository_id").references(() => repositories.id, {
			onDelete: "set null",
		}),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		branch: text().notNull(),
		baseBranch: text("base_branch").notNull().default("main"),

		// Status
		status: cloudSessionStatus().notNull().default("created"),
		sandboxStatus: cloudSandboxStatus().default("pending"),

		// Model configuration
		model: cloudModel().default("claude-sonnet-4"),

		// External links
		linearIssueId: text("linear_issue_id"),
		linearIssueKey: text("linear_issue_key"), // e.g., "SUPER-123"
		prUrl: text("pr_url"),
		prNumber: integer("pr_number"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
		lastActivityAt: timestamp("last_activity_at"),
		archivedAt: timestamp("archived_at"),
	},
	(table) => [
		index("cloud_workspaces_organization_id_idx").on(table.organizationId),
		index("cloud_workspaces_user_id_idx").on(table.userId),
		index("cloud_workspaces_session_id_idx").on(table.sessionId),
		index("cloud_workspaces_status_idx").on(table.status),
		index("cloud_workspaces_repository_id_idx").on(table.repositoryId),
		index("cloud_workspaces_linear_issue_id_idx").on(table.linearIssueId),
		unique("cloud_workspaces_org_session_unique").on(
			table.organizationId,
			table.sessionId,
		),
	],
);

export type InsertCloudWorkspace = typeof cloudWorkspaces.$inferInsert;
export type SelectCloudWorkspace = typeof cloudWorkspaces.$inferSelect;
