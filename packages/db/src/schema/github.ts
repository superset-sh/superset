import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { organizations, users } from "./auth";

/**
 * GitHub App installations linked to Superset organizations.
 * One organization can have one GitHub installation.
 */
export const githubInstallations = pgTable(
	"github_installations",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Link to Superset organization
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		connectedByUserId: uuid("connected_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// GitHub installation info
		installationId: text("installation_id").notNull().unique(),
		accountLogin: text("account_login").notNull(), // GitHub org/user login
		accountType: text("account_type").notNull(), // "Organization" | "User"

		// Permissions granted to the app
		permissions: jsonb().$type<Record<string, string>>(),

		// Suspension state
		suspended: boolean().notNull().default(false),
		suspendedAt: timestamp("suspended_at"),

		// Sync tracking
		lastSyncedAt: timestamp("last_synced_at"),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("github_installations_org_unique").on(table.organizationId),
		index("github_installations_installation_id_idx").on(table.installationId),
	],
);

export type InsertGithubInstallation = typeof githubInstallations.$inferInsert;
export type SelectGithubInstallation = typeof githubInstallations.$inferSelect;

/**
 * GitHub repositories accessible via an installation.
 */
export const githubRepositories = pgTable(
	"github_repositories",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Link to installation
		installationId: uuid("installation_id")
			.notNull()
			.references(() => githubInstallations.id, { onDelete: "cascade" }),

		// GitHub repo info
		repoId: text("repo_id").notNull().unique(), // GitHub's numeric ID as string
		owner: text().notNull(),
		name: text().notNull(),
		fullName: text("full_name").notNull(), // "owner/name"
		defaultBranch: text("default_branch").notNull().default("main"),
		isPrivate: boolean("is_private").notNull().default(false),

		// Timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("github_repositories_installation_id_idx").on(table.installationId),
		index("github_repositories_full_name_idx").on(table.fullName),
	],
);

export type InsertGithubRepository = typeof githubRepositories.$inferInsert;
export type SelectGithubRepository = typeof githubRepositories.$inferSelect;

/**
 * GitHub pull requests tracked for synced repositories.
 */
export const githubPullRequests = pgTable(
	"github_pull_requests",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Link to repository
		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => githubRepositories.id, { onDelete: "cascade" }),

		// PR identification
		prNumber: integer("pr_number").notNull(),
		nodeId: text("node_id").notNull(), // GitHub's GraphQL node ID

		// Branch info
		headBranch: text("head_branch").notNull(),
		headSha: text("head_sha").notNull(),
		baseBranch: text("base_branch").notNull(),

		// PR details
		title: text().notNull(),
		url: text().notNull(),
		authorLogin: text("author_login").notNull(),
		authorAvatarUrl: text("author_avatar_url"),

		// PR state
		state: text().notNull(), // "open" | "closed" | "merged"
		isDraft: boolean("is_draft").notNull().default(false),

		// Stats
		additions: integer().notNull().default(0),
		deletions: integer().notNull().default(0),
		changedFiles: integer("changed_files").notNull().default(0),

		// Review status
		reviewDecision: text("review_decision"), // "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null

		// CI/CD checks
		checksStatus: text("checks_status").notNull().default("none"), // "none" | "pending" | "success" | "failure"
		checks: jsonb()
			.$type<
				Array<{
					name: string;
					status: string;
					conclusion: string | null;
					detailsUrl?: string;
				}>
			>()
			.default([]),

		// Important timestamps
		mergedAt: timestamp("merged_at"),
		closedAt: timestamp("closed_at"),
		lastSyncedAt: timestamp("last_synced_at"),

		// Record timestamps
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("github_pull_requests_repo_pr_unique").on(
			table.repositoryId,
			table.prNumber,
		),
		index("github_pull_requests_repository_id_idx").on(table.repositoryId),
		index("github_pull_requests_state_idx").on(table.state),
		index("github_pull_requests_head_branch_idx").on(table.headBranch),
	],
);

export type InsertGithubPullRequest = typeof githubPullRequests.$inferInsert;
export type SelectGithubPullRequest = typeof githubPullRequests.$inferSelect;
