import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

import type {
	BranchPrefixMode,
	ExternalApp,
	FileOpenMode,
	GitHubStatus,
	GitStatus,
	TerminalLinkBehavior,
	TerminalPreset,
	WorkspaceType,
} from "./zod";

/**
 * Projects table - represents a git repository that the user has opened
 */
export const projects = sqliteTable(
	"projects",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		mainRepoPath: text("main_repo_path").notNull(),
		name: text("name").notNull(),
		color: text("color").notNull(),
		tabOrder: integer("tab_order"),
		lastOpenedAt: integer("last_opened_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		configToastDismissed: integer("config_toast_dismissed", {
			mode: "boolean",
		}),
		defaultBranch: text("default_branch"),
		githubOwner: text("github_owner"),
		branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
		branchPrefixCustom: text("branch_prefix_custom"),
		hideImage: integer("hide_image", { mode: "boolean" }),
		iconUrl: text("icon_url"),
		neonProjectId: text("neon_project_id"),
		defaultApp: text("default_app").$type<ExternalApp>(),
	},
	(table) => [
		index("projects_main_repo_path_idx").on(table.mainRepoPath),
		index("projects_last_opened_at_idx").on(table.lastOpenedAt),
	],
);

export type InsertProject = typeof projects.$inferInsert;
export type SelectProject = typeof projects.$inferSelect;

/**
 * Worktrees table - represents a git worktree within a project
 */
export const worktrees = sqliteTable(
	"worktrees",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		path: text("path").notNull(),
		branch: text("branch").notNull(),
		baseBranch: text("base_branch"), // The branch this worktree was created from
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		gitStatus: text("git_status", { mode: "json" }).$type<GitStatus>(),
		githubStatus: text("github_status", { mode: "json" }).$type<GitHubStatus>(),
	},
	(table) => [
		index("worktrees_project_id_idx").on(table.projectId),
		index("worktrees_branch_idx").on(table.branch),
	],
);

export type InsertWorktree = typeof worktrees.$inferInsert;
export type SelectWorktree = typeof worktrees.$inferSelect;

/**
 * Workspaces table - represents an active workspace (worktree or branch-based)
 */
export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		worktreeId: text("worktree_id").references(() => worktrees.id, {
			onDelete: "cascade",
		}), // Only set for type="worktree"
		type: text("type").notNull().$type<WorkspaceType>(),
		branch: text("branch").notNull(), // Branch name for both types
		name: text("name").notNull(),
		tabOrder: integer("tab_order").notNull(),
		createdAt: integer("created_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		updatedAt: integer("updated_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		lastOpenedAt: integer("last_opened_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		isUnread: integer("is_unread", { mode: "boolean" }).default(false),
		// Whether the workspace has an auto-generated name (branch name) that should prompt for rename
		isUnnamed: integer("is_unnamed", { mode: "boolean" }).default(false),
		// Timestamp when deletion was initiated. Non-null means deletion in progress.
		// Workspaces with deletingAt set should be filtered out from queries.
		deletingAt: integer("deleting_at"),
		// Allocated port base for multi-worktree dev instances.
		// Each workspace gets a range of 10 ports starting from this base.
		portBase: integer("port_base"),
	},
	(table) => [
		index("workspaces_project_id_idx").on(table.projectId),
		index("workspaces_worktree_id_idx").on(table.worktreeId),
		index("workspaces_last_opened_at_idx").on(table.lastOpenedAt),
		// NOTE: Migration 0006 creates an additional partial unique index:
		// CREATE UNIQUE INDEX workspaces_unique_branch_per_project
		//   ON workspaces(project_id) WHERE type = 'branch'
		// This enforces one branch workspace per project. Drizzle's schema DSL
		// doesn't support partial/filtered indexes, so this constraint is only
		// applied via the migration, not schema push. See migration 0006 for details.
	],
);

export type InsertWorkspace = typeof workspaces.$inferInsert;
export type SelectWorkspace = typeof workspaces.$inferSelect;

export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey().default(1),
	lastActiveWorkspaceId: text("last_active_workspace_id"),
	terminalPresets: text("terminal_presets", { mode: "json" }).$type<
		TerminalPreset[]
	>(),
	terminalPresetsInitialized: integer("terminal_presets_initialized", {
		mode: "boolean",
	}),
	selectedRingtoneId: text("selected_ringtone_id"),
	activeOrganizationId: text("active_organization_id"),
	confirmOnQuit: integer("confirm_on_quit", { mode: "boolean" }),
	terminalLinkBehavior: text(
		"terminal_link_behavior",
	).$type<TerminalLinkBehavior>(),
	terminalPersistence: integer("persist_terminal", { mode: "boolean" }).default(
		true,
	),
	autoApplyDefaultPreset: integer("auto_apply_default_preset", {
		mode: "boolean",
	}),
	branchPrefixMode: text("branch_prefix_mode").$type<BranchPrefixMode>(),
	branchPrefixCustom: text("branch_prefix_custom"),
	notificationSoundsMuted: integer("notification_sounds_muted", {
		mode: "boolean",
	}),
	deleteLocalBranch: integer("delete_local_branch", { mode: "boolean" }),
	fileOpenMode: text("file_open_mode").$type<FileOpenMode>(),
	showPresetsBar: integer("show_presets_bar", { mode: "boolean" }),
	terminalFontFamily: text("terminal_font_family"),
	terminalFontSize: integer("terminal_font_size"),
	editorFontFamily: text("editor_font_family"),
	editorFontSize: integer("editor_font_size"),
});

export type InsertSettings = typeof settings.$inferInsert;
export type SelectSettings = typeof settings.$inferSelect;

// =============================================================================
// Synced tables - mirrored from cloud Postgres via Electric SQL
// Column names match Postgres exactly (snake_case) so Electric data writes directly
// =============================================================================

export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type IntegrationProvider = "linear";

/**
 * Users table - synced from cloud
 */
export const users = sqliteTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerk_id: text("clerk_id").notNull().unique(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		avatar_url: text("avatar_url"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("users_email_idx").on(table.email),
		index("users_clerk_id_idx").on(table.clerk_id),
	],
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

/**
 * Organizations table - synced from cloud
 */
export const organizations = sqliteTable(
	"organizations",
	{
		id: text("id").primaryKey(),
		clerk_org_id: text("clerk_org_id").unique(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		github_org: text("github_org"),
		avatar_url: text("avatar_url"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
	},
	(table) => [
		index("organizations_slug_idx").on(table.slug),
		index("organizations_clerk_org_id_idx").on(table.clerk_org_id),
	],
);

export type InsertOrganization = typeof organizations.$inferInsert;
export type SelectOrganization = typeof organizations.$inferSelect;

/**
 * Organization members table - synced from cloud
 */
export const organizationMembers = sqliteTable(
	"organization_members",
	{
		id: text("id").primaryKey(),
		organization_id: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		user_id: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		created_at: text("created_at").notNull(),
	},
	(table) => [
		index("organization_members_organization_id_idx").on(table.organization_id),
		index("organization_members_user_id_idx").on(table.user_id),
	],
);

export type InsertOrganizationMember = typeof organizationMembers.$inferInsert;
export type SelectOrganizationMember = typeof organizationMembers.$inferSelect;

/**
 * Tasks table - synced from cloud
 */
export const tasks = sqliteTable(
	"tasks",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull().unique(),
		title: text("title").notNull(),
		description: text("description"),
		status: text("status").notNull(),
		status_color: text("status_color"),
		status_type: text("status_type"),
		status_position: integer("status_position"),
		priority: text("priority").notNull().$type<TaskPriority>(),
		organization_id: text("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		repository_id: text("repository_id"),
		assignee_id: text("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		creator_id: text("creator_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		estimate: integer("estimate"),
		due_date: text("due_date"),
		labels: text("labels", { mode: "json" }).$type<string[]>(),
		branch: text("branch"),
		pr_url: text("pr_url"),
		external_provider: text("external_provider").$type<IntegrationProvider>(),
		external_id: text("external_id"),
		external_key: text("external_key"),
		external_url: text("external_url"),
		last_synced_at: text("last_synced_at"),
		sync_error: text("sync_error"),
		started_at: text("started_at"),
		completed_at: text("completed_at"),
		deleted_at: text("deleted_at"),
		created_at: text("created_at").notNull(),
		updated_at: text("updated_at").notNull(),
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

/**
 * Browser history table - persists browsing history for URL autocomplete
 */
export const browserHistory = sqliteTable(
	"browser_history",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => uuidv4()),
		url: text("url").notNull().unique(),
		title: text("title").notNull().default(""),
		faviconUrl: text("favicon_url"),
		lastVisitedAt: integer("last_visited_at")
			.notNull()
			.$defaultFn(() => Date.now()),
		visitCount: integer("visit_count").notNull().default(1),
	},
	(table) => [
		index("browser_history_url_idx").on(table.url),
		index("browser_history_last_visited_at_idx").on(table.lastVisitedAt),
	],
);

export type InsertBrowserHistory = typeof browserHistory.$inferInsert;
export type SelectBrowserHistory = typeof browserHistory.$inferSelect;
