import type { HarnessKind, StopReason } from "@superset/session-protocol";
import type {
	AgentDefinitionId,
	BuiltinAgentId,
} from "@superset/shared/agent-catalog";
import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const terminalSessions = sqliteTable(
	"terminal_sessions",
	{
		id: text().primaryKey(),
		originWorkspaceId: text("origin_workspace_id").references(
			() => workspaces.id,
			{ onDelete: "set null" },
		),
		status: text().notNull().default("active"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastAttachedAt: integer("last_attached_at"),
		endedAt: integer("ended_at"),
	},
	(table) => [
		index("terminal_sessions_origin_workspace_id_idx").on(
			table.originWorkspaceId,
		),
		index("terminal_sessions_status_idx").on(table.status),
	],
);

export const terminalAgentBindings = sqliteTable(
	"terminal_agent_bindings",
	{
		terminalId: text("terminal_id")
			.primaryKey()
			.references(() => terminalSessions.id, { onDelete: "cascade" }),
		workspaceId: text("workspace_id").notNull(),
		agentId: text("agent_id").notNull().$type<BuiltinAgentId>(),
		agentSessionId: text("agent_session_id"),
		definitionId: text("definition_id").$type<AgentDefinitionId>(),
		startedAt: integer("started_at").notNull(),
		lastEventAt: integer("last_event_at").notNull(),
		lastEventType: text("last_event_type").notNull(),
	},
	(table) => [
		index("terminal_agent_bindings_workspace_id_idx").on(table.workspaceId),
	],
);

export const projects = sqliteTable(
	"projects",
	{
		id: text().primaryKey(),
		repoPath: text("repo_path").notNull(),
		repoProvider: text("repo_provider"),
		repoOwner: text("repo_owner"),
		repoName: text("repo_name"),
		repoUrl: text("repo_url"),
		remoteName: text("remote_name"),
		worktreeBaseDir: text("worktree_base_dir"),
		// Per-project branch-prefix override. A null `branchPrefixMode` means
		// "fall back to the host-wide default" in `host_settings`.
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [index("projects_repo_path_idx").on(table.repoPath)],
);

/**
 * Single-row host-wide settings (always `id = 1`). The host-service has no
 * generic settings store yet; this row holds host-wide knobs (worktree base
 * dir, branch-prefix default) that projects fall back to when they have no
 * override of their own.
 */
export const hostSettings = sqliteTable("host_settings", {
	id: integer().primaryKey().default(1),
	worktreeBaseDir: text("worktree_base_dir"),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
});

export const pullRequests = sqliteTable(
	"pull_requests",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		repoProvider: text("repo_provider").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		prNumber: integer("pr_number").notNull(),
		url: text().notNull(),
		title: text().notNull(),
		state: text().notNull(),
		isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
		headBranch: text("head_branch").notNull(),
		headSha: text("head_sha").notNull(),
		reviewDecision: text("review_decision"),
		checksStatus: text("checks_status").notNull().default("none"),
		checksJson: text("checks_json").notNull().default("[]"),
		lastFetchedAt: integer("last_fetched_at"),
		error: text(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("pull_requests_project_id_idx").on(table.projectId),
		index("pull_requests_repo_branch_idx").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.headBranch,
		),
		uniqueIndex("pull_requests_repo_pr_unique").on(
			table.repoProvider,
			table.repoOwner,
			table.repoName,
			table.prNumber,
		),
	],
);

export const hostAgentConfigs = sqliteTable(
	"host_agent_configs",
	{
		id: text().primaryKey(),
		presetId: text("preset_id").notNull(),
		// Optional icon override. When null the client falls back to the icon
		// implied by `presetId`. User-authored ("custom") agents set this to a
		// built-in icon key (e.g. "claude") to pick a recognizable icon.
		iconId: text("icon_id"),
		label: text().notNull(),
		command: text().notNull(),
		argsJson: text("args_json").notNull().default("[]"),
		promptTransport: text("prompt_transport").notNull(),
		promptArgsJson: text("prompt_args_json").notNull().default("[]"),
		envJson: text("env_json").notNull().default("{}"),
		displayOrder: integer("display_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		index("host_agent_configs_display_order_idx").on(table.displayOrder),
	],
);

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		worktreePath: text("worktree_path").notNull(),
		branch: text().notNull(),
		headSha: text("head_sha"),
		upstreamOwner: text("upstream_owner"),
		upstreamRepo: text("upstream_repo"),
		upstreamBranch: text("upstream_branch"),
		pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
			onDelete: "set null",
		}),
		// Empty string means "not yet backfilled from cloud" — the startup
		// backfill sweep targets these rows.
		name: text().notNull().default(""),
		type: text().$type<"main" | "worktree">().notNull().default("worktree"),
		taskId: text("task_id"),
		createdByUserId: text("created_by_user_id"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
		// Null = local changes not yet pushed to the cloud mirror (dual-write
		// era only; the column and reconciler go away in R3).
		cloudSyncedAt: integer("cloud_synced_at"),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_upstream_ref_idx").on(
			table.upstreamOwner,
			table.upstreamRepo,
			table.upstreamBranch,
		),
		index("workspaces_pull_request_id_idx").on(table.pullRequestId),
		uniqueIndex("workspaces_one_main_per_project")
			.on(table.projectId)
			.where(sql`type = 'main'`),
	],
);

/**
 * Registry of ACP agent sessions (docs/acp-sessions.md). One row per
 * session, kept fresh on every state emit. Rows survive host restarts so the
 * manager can list them as `offline` and resurrect on demand via the
 * adapter's `session/load` — the journal itself is not persisted; transcript
 * replay comes from the agent harness's own on-disk session store.
 */
export const acpSessions = sqliteTable(
	"acp_sessions",
	{
		sessionId: text("session_id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		/** Adapter-side ACP session id — the `session/load` key. */
		acpSessionId: text("acp_session_id").notNull(),
		harness: text().notNull().$type<HarnessKind>(),
		cwd: text().notNull(),
		title: text(),
		lastStopReason: text("last_stop_reason").$type<StopReason>(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("acp_sessions_workspace_id_idx").on(table.workspaceId)],
);

/**
 * Tombstones for workspaces deleted while the cloud was unreachable. The
 * reconciler drains this into `v2Workspace.delete` calls; rows are removed
 * once the cloud confirms. Dual-write era only — dropped in R3.
 */
export const workspaceCloudDeletes = sqliteTable("workspace_cloud_deletes", {
	id: text().primaryKey(),
	queuedAt: integer("queued_at")
		.notNull()
		.$defaultFn(() => Date.now()),
});
