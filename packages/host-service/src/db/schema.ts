import type {
	AgentDefinitionId,
	AgentIdentityId,
} from "@superset/shared/agent-catalog";
import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	primaryKey,
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
		/**
		 * Set the moment a dispose is requested — durable intent-to-kill. A
		 * failed kill leaves the row `active` with this stamp, and the reaper
		 * retries it regardless of workspace liveness (a one-shot renderer
		 * broadcast must not be the only chance to kill a session).
		 */
		disposeRequestedAt: integer("dispose_requested_at"),
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
		agentId: text("agent_id").notNull().$type<AgentIdentityId>(),
		agentSessionId: text("agent_session_id"),
		definitionId: text("definition_id").$type<AgentDefinitionId>(),
		startedAt: integer("started_at").notNull(),
		lastEventAt: integer("last_event_at").notNull(),
		lastEventType: text("last_event_type").notNull(),
		// Set when the agent session ended. "detached" = the agent reported its
		// own end (SessionEnd hook) — not resumable; "terminal-exited" = the
		// terminal died under it (kill, crash, reboot) — resume candidate;
		// "resumed" = the candidate was consumed by an auto-resume; "disposed"
		// = deliberately killed (pane close, CLI kill) — never resumable.
		endedAt: integer("ended_at"),
		endReason: text("end_reason"),
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
		// Custom project icon as a small downscaled data-URI. Null falls back to
		// the GitHub owner avatar (when a repo is linked) or a placeholder.
		icon: text("icon"),
		// Accent color as a `#rrggbb` hex. Null means the default (no accent).
		color: text("color"),
		// JSON array of repo-relative folders to cone-mode sparse-checkout into
		// new worktrees. Null (the default) means a full checkout. Read through
		// `parseSparseCheckoutPaths` — the encoding is not part of the API.
		sparseCheckoutPaths: text("sparse_checkout_paths"),
		// Free-text instructions injected into AI workspace/branch naming for
		// this project (e.g. "include the Linear ticket id in the branch name").
		// Null means the default naming behavior.
		namingInstructions: text("naming_instructions"),
		// Empty string means "not yet backfilled" — the startup sweep targets
		// these rows (name from cloud legacy row if reachable, else basename).
		name: text().notNull().default(""),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
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
	// Which provider login newly launched agents use, as the profile dir to
	// inject (CLAUDE_CONFIG_DIR / CODEX_HOME). Null = the system default login.
	defaultClaudeConfigDir: text("default_claude_config_dir"),
	defaultCodexHome: text("default_codex_home"),
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
		// GitHub's own merge time once a fetch has carried one, otherwise the
		// time the merge was first observed; never cleared. Anchors "merged in
		// the last N days" windows on the workspaces board.
		mergedAt: integer("merged_at"),
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
		// Args that resume a previous session; the session id is appended after
		// them. Empty means the agent has no id-based resume.
		resumeArgsJson: text("resume_args_json").notNull().default("[]"),
		// Args that fork a previous session into a new provider session id.
		forkArgsJson: text("fork_args_json").notNull().default("[]"),
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
		// Null = a project-less "session" workspace (managed folder under
		// ~/.superset/sessions, its own standalone git repo).
		projectId: text("project_id").references(() => projects.id, {
			onDelete: "cascade",
		}),
		worktreePath: text("worktree_path").notNull(),
		branch: text().notNull(),
		headSha: text("head_sha"),
		upstreamOwner: text("upstream_owner"),
		upstreamRepo: text("upstream_repo"),
		upstreamBranch: text("upstream_branch"),
		pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
			onDelete: "set null",
		}),
		// Set when the user removes the PR link; the refresh sweep must not
		// re-link this specific PR. A different PR on the branch still links.
		suppressedPullRequestId: text("suppressed_pull_request_id").references(
			() => pullRequests.id,
			{ onDelete: "set null" },
		),
		// Empty string means "not yet backfilled from cloud" — the startup
		// backfill sweep targets these rows.
		name: text().notNull().default(""),
		type: text()
			.$type<"main" | "worktree" | "session">()
			.notNull()
			.default("worktree"),
		taskId: text("task_id"),
		createdByUserId: text("created_by_user_id"),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		// 0 means "predates local ownership"; write paths always set it.
		updatedAt: integer("updated_at").notNull().default(0),
		// Epoch ms of the newest agent lifecycle event in this workspace (see
		// touchLocalWorkspaceActivity). Distinct from updatedAt, which only
		// moves on metadata writes. Inserts stamp creation as the first
		// activity; rows that predate the column stay null and consumers fall
		// back to updatedAt.
		lastActivityAt: integer("last_activity_at").$defaultFn(() => Date.now()),
		// Null = local changes not yet pushed to the cloud mirror (dual-write
		// era only; the column and reconciler go away in R3).
		// Tombstone: null = live. Set at the destroy commit point; rows are
		// kept forever and surface on the board's Merged/Deleted columns.
		archivedAt: integer("archived_at"),
		// "merged" when the linked PR was merged at destroy time.
		archiveReason: text("archive_reason").$type<"merged" | "deleted">(),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_archived_at_idx").on(table.archivedAt),
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
 * Host-local presentation for a tag folder. A row exists only once someone
 * customises the folder (same lifecycle as the old local row), beside the
 * workspace tags it describes. `tag` stays the stable slug agents target;
 * `display_name` is what the sidebar shows — which makes rename a one-row
 * update instead of retagging every member.
 *
 * A folder is a (scope, tag) pair. `scope` is a project id, or the
 * `SESSIONS_TAG_SCOPE` sentinel for the project-less Sessions lane — project
 * ids are UUIDs, so the sentinel can never collide. Keying on one NOT NULL
 * column (rather than a nullable `project_id`) keeps a single read path and
 * sidesteps SQLite's quirk of permitting NULLs inside a PRIMARY KEY, which
 * would silently allow duplicate session rows.
 *
 * The trade for dropping the old FK to `projects`: deleting a project no
 * longer cascades here, so `project.remove` clears its rows explicitly.
 */
export const tagFolderSettings = sqliteTable(
	"tag_folder_settings",
	{
		scope: text().notNull(),
		tag: text().notNull(),
		// A folder is personal like the tags it derives from (see
		// `workspaceTags`): keyed per user so renaming yours never renames a
		// teammate's folder of the same tag. Same NOT NULL / empty-string
		// convention: '' = customised before folders had an owner.
		createdByUserId: text("created_by_user_id").notNull().default(""),
		displayName: text("display_name"),
		color: text(),
		tabOrder: integer("tab_order"),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		primaryKey({
			columns: [table.scope, table.tag, table.createdByUserId],
		}),
	],
);

/**
 * Plain-string tags on workspaces — no tag entity, no tag ids. `tag` is
 * stored already-normalized (trimmed + lowercased, see
 * `@superset/shared/workspace-tags`); sidebar folders derive from these
 * rows, so any actor that can tag a workspace can file it.
 *
 * A tag belongs to whoever applied it: on a shared host, every user files
 * the same workspaces into their own folders, and one user's grouping must
 * not appear in another's sidebar. `created_by_user_id` is part of the key
 * so two users can each carry the same tag on one workspace. It is NOT NULL
 * because SQLite treats NULLs inside a primary key as distinct, which would
 * let duplicate rows through; the empty string is the "creator unknown"
 * value for rows written by callers that carry no user (visible to all).
 */
export const workspaceTags = sqliteTable(
	"workspace_tags",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		tag: text().notNull(),
		createdByUserId: text("created_by_user_id").notNull().default(""),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
	},
	(table) => [
		primaryKey({
			columns: [table.workspaceId, table.tag, table.createdByUserId],
		}),
		index("workspace_tags_tag_idx").on(table.tag),
	],
);

/**
 * Every pull request a workspace has ever been linked to, append-only.
 * `workspaces.pullRequestId` stays the single "currently linked" pointer the
 * sidebar shows (and Remove PR Link clears); this table is the memory that
 * survives the pointer moving on — a workspace that opens a PR per branch
 * accumulates one row each. Unlinking hides a PR from the sidebar, never
 * from here.
 */
export const workspacePullRequests = sqliteTable(
	"workspace_pull_requests",
	{
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		pullRequestId: text("pull_request_id")
			.notNull()
			.references(() => pullRequests.id, { onDelete: "cascade" }),
		linkedAt: integer("linked_at").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.workspaceId, table.pullRequestId] }),
		index("workspace_pull_requests_workspace_idx").on(table.workspaceId),
	],
);
