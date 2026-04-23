import type { WorkspaceState } from "@superset/panes";
import { z } from "zod";

const persistedDateSchema = z
	.union([z.string(), z.date()])
	.transform((value) => (typeof value === "string" ? new Date(value) : value));

export const dashboardSidebarProjectSchema = z.object({
	projectId: z.string().uuid(),
	createdAt: persistedDateSchema,
	isCollapsed: z.boolean().default(false),
	tabOrder: z.number().int().default(0),
	defaultOpenInApp: z.string().nullable().default(null),
});

const paneWorkspaceStateSchema = z.custom<WorkspaceState<unknown>>();

const changesFilterSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("all") }),
	z.object({ kind: z.literal("uncommitted") }),
	z.object({ kind: z.literal("commit"), hash: z.string() }),
	z.object({
		kind: z.literal("range"),
		fromHash: z.string(),
		toHash: z.string(),
	}),
]);

export type ChangesFilter = z.infer<typeof changesFilterSchema>;

export const workspaceLocalStateSchema = z.object({
	workspaceId: z.string().uuid(),
	createdAt: persistedDateSchema,
	sidebarState: z.object({
		projectId: z.string().uuid(),
		tabOrder: z.number().int().default(0),
		sectionId: z.string().uuid().nullable().default(null),
		changesFilter: changesFilterSchema.default({ kind: "all" }),
		changesSubtab: z.enum(["diffs", "review"]).default("diffs"),
	}),
	paneLayout: paneWorkspaceStateSchema,
	viewedFiles: z.array(z.string()).default([]),
	recentlyViewedFiles: z
		.array(
			z.object({
				relativePath: z.string(),
				absolutePath: z.string(),
				lastAccessedAt: z.number(),
			}),
		)
		.default([]),
});

export const dashboardSidebarSectionSchema = z.object({
	sectionId: z.string().uuid(),
	projectId: z.string().uuid(),
	name: z.string().trim().min(1),
	createdAt: persistedDateSchema,
	tabOrder: z.number().int().default(0),
	isCollapsed: z.boolean().default(false),
	color: z.string().nullable().default(null),
});

const v2ExecutionModeSchema = z.enum([
	"split-pane",
	"new-tab",
	"new-tab-split-pane",
]);

// projectIds uses plain z.string() (not uuid) because v1 accepts arbitrary
// string IDs and the migration copies them verbatim.
export const v2TerminalPresetSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	description: z.string().optional(),
	cwd: z.string().default(""),
	commands: z.array(z.string()).default([]),
	projectIds: z.array(z.string()).nullable().default(null),
	pinnedToBar: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: v2ExecutionModeSchema.default("new-tab"),
	tabOrder: z.number().int().default(0),
	createdAt: persistedDateSchema,
});

// Structured shapes for pending-row payload fields. Previously these were
// `z.unknown()` which forced `as`-casts at every read site and hid malformed
// rows until they crashed a later consumer. Typing them here gives the
// collection real validation and lets consumers read fields directly.
const pendingHostTargetSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("local") }),
	z.object({ kind: z.literal("host"), hostId: z.string() }),
]);

const pendingLinkedIssueSchema = z.object({
	slug: z.string(),
	title: z.string(),
	source: z.enum(["github", "internal"]).optional(),
	url: z.string().optional(),
	taskId: z.string().optional(),
	number: z.number().optional(),
	state: z.enum(["open", "closed"]).optional(),
});

const pendingLinkedPRSchema = z.object({
	prNumber: z.number(),
	title: z.string(),
	url: z.string(),
	state: z.string(),
});

/**
 * Transient dispatch intents written by the pending page after
 * host-service.create resolves. Consumed by the V2 workspace page's
 * useConsumePendingLaunch mount effect, then cleared. See
 * apps/desktop/docs/V2_LAUNCH_CONTEXT.md "Dispatch architecture".
 */
const pendingTerminalLaunchSchema = z.object({
	command: z.string(),
	name: z.string().optional(),
	// Attachment filenames, already written to .superset/attachments/
	// by the pending page via workspaceTrpc.filesystem.writeFile.
	attachmentNames: z.array(z.string()).default([]),
});

const pendingChatLaunchSchema = z.object({
	initialPrompt: z.string().optional(),
	initialFiles: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
	model: z.string().optional(),
	taskSlug: z.string().optional(),
});

export type PendingHostTarget = z.infer<typeof pendingHostTargetSchema>;
export type PendingLinkedIssue = z.infer<typeof pendingLinkedIssueSchema>;
export type PendingLinkedPR = z.infer<typeof pendingLinkedPRSchema>;
export type PendingTerminalLaunch = z.infer<typeof pendingTerminalLaunchSchema>;
export type PendingChatLaunch = z.infer<typeof pendingChatLaunchSchema>;

export const pendingWorkspaceSchema = z.object({
	// Shared
	id: z.string().uuid(),
	projectId: z.string().uuid(),
	hostTarget: pendingHostTargetSchema,
	// Which mutation the pending page should run. See V2_WORKSPACE_CREATION.md §3.
	// Defaults to "fork" for any rows that predate this field.
	intent: z.enum(["fork", "checkout", "adopt", "pr-checkout"]).default("fork"),
	name: z.string(),
	// True iff `name` came from the friendly-random fallback (no user-typed
	// title). Host-service uses this to decide whether to run the post-create
	// AI rename — a user-typed title wins. Defaults to true for pre-field
	// rows so behavior matches the unedited-name path.
	workspaceNameWasAutoGenerated: z.boolean().default(true),
	// fork: derived branch name from prompt; checkout/adopt: existing branch.
	branchName: z.string(),
	status: z.enum(["creating", "failed", "succeeded"]).default("creating"),
	error: z.string().nullable().default(null),
	workspaceId: z.string().nullable().default(null),
	// Non-fatal messages from the procedure (e.g. "setup terminal failed").
	// Pending page renders these on success.
	warnings: z.array(z.string()).default([]),
	terminals: z
		.array(z.object({ id: z.string(), role: z.string(), label: z.string() }))
		.default([]),
	createdAt: persistedDateSchema,

	// Fork-only (left at defaults for checkout/adopt).
	prompt: z.string().default(""),
	baseBranch: z.string().nullable().default(null),
	// Picker hint: which form of `baseBranch` was selected. Lets the host-
	// service skip re-resolution at create time so it can't be misled by a
	// stale cached remote ref. Null when the caller didn't specify.
	baseBranchSource: z
		.enum(["local", "remote-tracking"])
		.nullable()
		.default(null),
	linkedIssues: z.array(pendingLinkedIssueSchema).default([]),
	linkedPR: pendingLinkedPRSchema.nullable().default(null),
	attachmentCount: z.number().int().default(0),

	// fork + checkout (irrelevant for adopt — worktree already exists).
	runSetupScript: z.boolean().default(true),

	// Transient dispatch intents written after host-service.create resolves;
	// consumed by the V2 workspace page on mount, then cleared to null.
	terminalLaunch: pendingTerminalLaunchSchema.nullable().default(null),
	chatLaunch: pendingChatLaunchSchema.nullable().default(null),
});

export type PendingWorkspaceRow = z.infer<typeof pendingWorkspaceSchema>;

export type DashboardSidebarProjectRow = z.infer<
	typeof dashboardSidebarProjectSchema
>;
export type WorkspaceLocalStateRow = z.infer<typeof workspaceLocalStateSchema>;
export type DashboardSidebarSectionRow = z.infer<
	typeof dashboardSidebarSectionSchema
>;
export type V2TerminalPresetRow = z.infer<typeof v2TerminalPresetSchema>;

/**
 * Singleton row of v2 user-scoped preferences. Today this carries link-click
 * behavior only; add fields here as v2 grows additional preferences.
 *
 * fileLinks / urlLinks map click tiers (plain, ⌘, ⌘⇧) to an action:
 *   - null        → tier is unbound (terminal shows a hint; chat/markdown no-op)
 *   - "pane"      → open in an in-app pane (FilePane / BrowserPane)
 *   - "external"  → open in the external app (editor / system browser)
 *
 * Terminal consumes all three tiers; 2-tier surfaces (chat, task markdown)
 * read plain + meta and ignore metaShift.
 */
const linkActionSchema = z.enum(["pane", "external"]);

export type LinkAction = z.infer<typeof linkActionSchema>;

const linkTierMapSchema = z.object({
	plain: linkActionSchema.nullable(),
	meta: linkActionSchema.nullable(),
	metaShift: linkActionSchema.nullable(),
});

export type LinkTierMap = z.infer<typeof linkTierMapSchema>;
export type LinkTier = keyof LinkTierMap;

const DEFAULT_LINK_TIER_MAP: LinkTierMap = {
	plain: null,
	meta: "pane",
	metaShift: "external",
};

export const v2UserPreferencesSchema = z.object({
	id: z.literal("preferences"),
	fileLinks: linkTierMapSchema.default(DEFAULT_LINK_TIER_MAP),
	urlLinks: linkTierMapSchema.default(DEFAULT_LINK_TIER_MAP),
	rightSidebarOpen: z.boolean().default(true),
	rightSidebarTab: z.enum(["changes", "files"]).default("changes"),
	deleteLocalBranch: z.boolean().default(false),
});

export type V2UserPreferencesRow = z.infer<typeof v2UserPreferencesSchema>;

export const V2_USER_PREFERENCES_ID = "preferences" as const;

export const DEFAULT_V2_USER_PREFERENCES: V2UserPreferencesRow = {
	id: V2_USER_PREFERENCES_ID,
	fileLinks: DEFAULT_LINK_TIER_MAP,
	urlLinks: DEFAULT_LINK_TIER_MAP,
	rightSidebarOpen: true,
	rightSidebarTab: "changes",
	deleteLocalBranch: false,
};
