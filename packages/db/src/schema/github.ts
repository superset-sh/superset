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

// GitHub App installations (one per organization)
export const githubInstallations = pgTable(
	"github_installations",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		connectedByUserId: uuid("connected_by_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// GitHub App installation data
		installationId: text("installation_id").notNull().unique(),
		accountLogin: text("account_login").notNull(),
		accountType: text("account_type").notNull(), // "Organization" | "User"

		// Permissions granted to the app
		permissions: jsonb().$type<Record<string, string>>().notNull(),

		// Suspension status
		suspended: boolean().notNull().default(false),
		suspendedAt: timestamp("suspended_at"),

		// Sync tracking
		lastSyncedAt: timestamp("last_synced_at"),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("github_installations_org_unique").on(table.organizationId),
		index("github_installations_installation_id_idx").on(
			table.installationId,
		),
		index("github_installations_org_idx").on(table.organizationId),
	],
);

export type InsertGithubInstallation = typeof githubInstallations.$inferInsert;
export type SelectGithubInstallation = typeof githubInstallations.$inferSelect;

// Repositories accessible via GitHub installation
export const githubRepositories = pgTable(
	"github_repositories",
	{
		id: uuid().primaryKey().defaultRandom(),
		installationId: uuid("installation_id")
			.notNull()
			.references(() => githubInstallations.id, { onDelete: "cascade" }),

		// GitHub repo identifiers
		repoId: text("repo_id").notNull(), // GitHub's repo ID (immutable)
		fullName: text("full_name").notNull(), // "owner/repo"
		name: text("name").notNull(),
		owner: text("owner").notNull(),

		defaultBranch: text("default_branch").notNull().default("main"),
		isPrivate: boolean("is_private").notNull(),

		// Sync control
		enabled: boolean().notNull().default(true), // User can disable specific repos

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("github_repositories_repo_id_unique").on(table.repoId),
		index("github_repositories_installation_idx").on(table.installationId),
		index("github_repositories_full_name_idx").on(table.fullName),
	],
);

export type InsertGithubRepository = typeof githubRepositories.$inferInsert;
export type SelectGithubRepository = typeof githubRepositories.$inferSelect;

// Pull request metadata cache
export const githubPullRequests = pgTable(
	"github_pull_requests",
	{
		id: uuid().primaryKey().defaultRandom(),
		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => githubRepositories.id, { onDelete: "cascade" }),

		// PR identifiers
		prNumber: integer("pr_number").notNull(),
		nodeId: text("node_id").notNull().unique(), // GitHub's global node ID

		// PR metadata
		title: text().notNull(),
		state: text().notNull(), // "open", "draft", "merged", "closed"
		isDraft: boolean("is_draft").notNull(),
		url: text().notNull(),

		// Branch info
		headBranch: text("head_branch").notNull(),
		baseBranch: text("base_branch").notNull(),
		headSha: text("head_sha").notNull(), // For detecting updates

		// Author
		authorLogin: text("author_login").notNull(),
		authorAvatarUrl: text("author_avatar_url"),

		// Stats
		additions: integer().notNull(),
		deletions: integer().notNull(),
		changedFiles: integer("changed_files").notNull(),

		// Review status
		reviewDecision: text("review_decision"), // "APPROVED", "CHANGES_REQUESTED", null

		// Check status rollup
		checksStatus: text("checks_status").notNull(), // "success", "failure", "pending", "none"
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

		// Timestamps
		mergedAt: timestamp("merged_at"),
		closedAt: timestamp("closed_at"),

		// Sync metadata
		lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
		etag: text(), // For conditional requests

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
		index("github_pull_requests_repo_idx").on(table.repositoryId),
		index("github_pull_requests_head_branch_idx").on(table.headBranch),
		index("github_pull_requests_state_idx").on(table.state),
		index("github_pull_requests_checks_status_idx").on(table.checksStatus),
		index("github_pull_requests_synced_at_idx").on(table.lastSyncedAt),
	],
);

export type InsertGithubPullRequest = typeof githubPullRequests.$inferInsert;
export type SelectGithubPullRequest = typeof githubPullRequests.$inferSelect;
