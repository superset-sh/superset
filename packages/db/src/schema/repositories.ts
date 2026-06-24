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

import { organizations } from "./auth";
import { githubInstallations } from "./github";
import { integrationConnections, integrationProvider } from "./schema";

/**
 * Provider-discriminated review/merge state, stored verbatim per provider (spec §6,
 * "the no-reduction core"). Each variant holds that provider's own server-computed
 * facts — there is no synthesized cross-provider verdict and no derived status
 * persisted as truth.
 *
 * This mirrors the canonical `NormalizedReviewState` defined in
 * `packages/host-service/src/runtime/repo-providers/types.ts` (which is intentionally
 * not exported from host-service; consumers keep a local mirror). The desktop local
 * DB already persists this union via a `reviewStateJson` column; the cloud schema uses
 * the same shape so the two halves stay in lockstep.
 */
export type NormalizedReviewState =
	| { provider: "github"; reviewDecision: string | null }
	| {
			provider: "gitlab";
			detailedMergeStatus: string;
			approvalsRequired: number | null;
			approvalsLeft: number | null;
			approvedBy: string[];
			blockingDiscussionsResolved: boolean;
			hasConflicts: boolean;
	  };

/**
 * Provider-agnostic repositories. Supersedes `githubRepositories` (kept during the
 * expand/contract migration). Repo→connection linkage differs by provider, so exactly
 * one of `installationId` (GitHub App) / `connectionId` (GitLab) is set; both providers
 * always carry `organizationId` (denormalized for Electric SQL org-scoped filtering).
 */
export const repositories = pgTable(
	"repositories",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Provider identity. `host` disambiguates self-managed instances that may reuse
		// the same numeric project IDs (e.g. two GitLab installs).
		provider: integrationProvider().notNull(),
		host: text().notNull(), // "github.com" | "gitlab.com" | self-managed host

		// Provider linkage — exactly one is set:
		// - GitHub: installationId (FK githubInstallations, which stays GitHub-specific)
		// - GitLab: connectionId (FK integrationConnections, like Linear/Slack)
		installationId: uuid("installation_id").references(
			() => githubInstallations.id,
			{ onDelete: "cascade" },
		),
		connectionId: uuid("connection_id").references(
			() => integrationConnections.id,
			{ onDelete: "cascade" },
		),

		// Always present (denormalized for Electric SQL filtering).
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		// Provider repo/project identity. `externalId` = provider's numeric ID as string
		// (GitHub repo id / GitLab project id).
		externalId: text("external_id").notNull(),
		owner: text().notNull(),
		name: text().notNull(),
		fullName: text("full_name").notNull(), // "owner/name" / full namespace path
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
		unique("repositories_provider_host_external_id_unique").on(
			table.provider,
			table.host,
			table.externalId,
		),
		index("repositories_installation_id_idx").on(table.installationId),
		index("repositories_connection_id_idx").on(table.connectionId),
		index("repositories_full_name_idx").on(table.fullName),
		index("repositories_org_id_idx").on(table.organizationId),
	],
);

export type InsertRepository = typeof repositories.$inferInsert;
export type SelectRepository = typeof repositories.$inferSelect;

/**
 * Provider-agnostic pull/merge requests. Supersedes `githubPullRequests` (kept during
 * the expand/contract migration). The single GitHub `reviewDecision` column is replaced
 * by the typed `reviewStateJson` union (spec §6) — facts stored verbatim, no reduction.
 * `state` is widened to include GitLab's transient `"locked"`.
 */
export const pullRequests = pgTable(
	"pull_requests",
	{
		id: uuid().primaryKey().defaultRandom(),

		repositoryId: uuid("repository_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),

		// Denormalized for Electric SQL filtering.
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		provider: integrationProvider().notNull(),
		host: text().notNull(),

		// Identity: `number` = GitHub PR number / GitLab MR iid (per-repo). `externalId`
		// = provider global id (GitHub node_id / GitLab MR global id).
		number: integer().notNull(),
		externalId: text("external_id").notNull(),

		// Branch info
		headBranch: text("head_branch").notNull(),
		headSha: text("head_sha").notNull(),
		baseBranch: text("base_branch").notNull(),

		// Details
		title: text().notNull(),
		url: text().notNull(),
		authorLogin: text("author_login").notNull(),
		authorAvatarUrl: text("author_avatar_url"),

		// State — "open" | "closed" | "merged" | "draft" | "locked" (GitLab-only).
		state: text().notNull(),
		isDraft: boolean("is_draft").notNull().default(false),

		// Stats
		additions: integer().notNull().default(0),
		deletions: integer().notNull().default(0),
		changedFiles: integer("changed_files").notNull().default(0),

		// Review/merge fidelity model (spec §6). Typed JSON, mirroring the `checks`
		// convention. Replaces the GitHub-only `reviewDecision` scalar.
		reviewStateJson: jsonb("review_state_json").$type<NormalizedReviewState>(),

		// CI/CD checks (shared shape; GitLab pipeline jobs map into the same list).
		checksStatus: text("checks_status").notNull().default("none"),
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
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		unique("pull_requests_repo_number_unique").on(
			table.repositoryId,
			table.number,
		),
		index("pull_requests_repository_id_idx").on(table.repositoryId),
		index("pull_requests_state_idx").on(table.state),
		index("pull_requests_head_branch_idx").on(table.headBranch),
		index("pull_requests_org_id_idx").on(table.organizationId),
	],
);

export type InsertPullRequest = typeof pullRequests.$inferInsert;
export type SelectPullRequest = typeof pullRequests.$inferSelect;
