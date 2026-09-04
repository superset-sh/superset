import type { AppRouter } from "@superset/host-service";
import type { LayoutNode, Tab, WorkspaceState } from "@superset/panes";
import { tagFolderScopeInputSchema } from "@superset/shared/workspace-tags";
import type { inferRouterInputs } from "@trpc/server";
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

// Structural validators for the persisted pane layout. `paneWorkspaceStateSchema`
// above is a permissive passthrough for writes (the store always produces a
// valid shape); these run on READ via `sanitizePaneLayout` so a malformed or
// legacy-shaped layout (e.g. the pre-binary-tree `{ panes, focusedPaneId }`
// shape) is healed instead of feeding an undefined node to the renderer.
const layoutNodeSchema: z.ZodType<LayoutNode> = z.lazy(() =>
	z.discriminatedUnion("type", [
		z.object({ type: z.literal("pane"), paneId: z.string() }),
		z.object({
			type: z.literal("split"),
			direction: z.enum(["horizontal", "vertical"]),
			first: layoutNodeSchema,
			second: layoutNodeSchema,
			splitPercentage: z.number().optional(),
		}),
	]),
);

const paneNodeSchema = z.object({
	id: z.string(),
	kind: z.string(),
	titleOverride: z.string().optional(),
	pinned: z.boolean().optional(),
	data: z.unknown(),
});

const tabNodeSchema = z.object({
	id: z.string(),
	titleOverride: z.string().optional(),
	createdAt: z.number(),
	activePaneId: z.string().nullable(),
	layout: layoutNodeSchema,
	panes: z.record(z.string(), paneNodeSchema),
});

const EMPTY_PANE_LAYOUT: WorkspaceState<unknown> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

/**
 * Read-time heal for a persisted pane layout. An unparseable top-level shape
 * (missing `version`/`tabs`, or the legacy `{ panes, focusedPaneId }` layout)
 * resets to empty; individually-corrupt tabs (e.g. a split node missing a
 * child) are dropped while valid tabs are kept, and `activeTabId` is repaired
 * to point at a surviving tab. Prevents the renderer from rendering an
 * undefined layout node.
 */
export function sanitizePaneLayout(raw: unknown): WorkspaceState<unknown> {
	if (!raw || typeof raw !== "object") return EMPTY_PANE_LAYOUT;
	const value = raw as Record<string, unknown>;
	if (value.version !== 1 || !Array.isArray(value.tabs)) {
		return EMPTY_PANE_LAYOUT;
	}
	const tabs = value.tabs.flatMap((tab): Tab<unknown>[] => {
		const parsed = tabNodeSchema.safeParse(tab);
		return parsed.success ? [parsed.data as Tab<unknown>] : [];
	});
	const activeTabId =
		typeof value.activeTabId === "string" &&
		tabs.some((tab) => tab.id === value.activeTabId)
			? value.activeTabId
			: (tabs[0]?.id ?? null);
	return { version: 1, tabs, activeTabId };
}

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

export type ChangesViewMode = "folders" | "tree";

const workspaceRunStateSchema = z.enum([
	"running",
	"stopped-by-user",
	"stopped-by-exit",
]);

export const workspaceRunTerminalStateSchema = z.object({
	terminalId: z.string(),
	workspaceId: z.string().uuid(),
	state: workspaceRunStateSchema,
	command: z.string(),
	definitionSource: z.enum(["project-config", "terminal-preset"]),
	definitionId: z.string().optional(),
	startedAt: z.number(),
	stoppedAt: z.number().optional(),
	exitCode: z.number().optional(),
	signal: z.number().optional(),
	stopRequestedAt: z.number().optional(),
});

// "pages" is a retired tab; persisted rows on it heal to "changes" below.
export const WORKSPACE_SIDEBAR_TABS = ["changes", "files", "review"] as const;

const WORKSPACE_SIDEBAR_TAB_SCHEMA = z.enum(WORKSPACE_SIDEBAR_TABS);

export type WorkspaceSidebarTab = (typeof WORKSPACE_SIDEBAR_TABS)[number];

export const workspaceLocalStateSchema = z.object({
	workspaceId: z.string().uuid(),
	createdAt: persistedDateSchema,
	sidebarState: z.object({
		// Null = project-less "session" workspace (renders in the Sessions
		// section). Identity field: no default — widening string → string|null
		// keeps every pre-existing persisted row parsing unchanged, and heal
		// must never synthesize null (that would silently reparent a corrupt
		// project workspace into Sessions).
		projectId: z.string().uuid().nullable(),
		tabOrder: z.number().int().default(0),
		// Widened from uuid: may point at a tag-backed folder's composite
		// `${projectId}:${tag}` key (written by move-into-derived-folder).
		sectionId: z.string().min(1).nullable().default(null),
		changesFilter: changesFilterSchema.default({ kind: "all" }),
		changesViewMode: z.enum(["folders", "tree"]).default("folders"),
		activeTab: WORKSPACE_SIDEBAR_TAB_SCHEMA.default("changes"),
		isHidden: z.boolean().default(false),
		// Epoch ms when the user pinned this workspace to the sidebar's Pinned
		// section; null = not pinned. Ordering is pinnedAt ascending.
		pinnedAt: z.number().int().nullable().default(null),
		// "Remove PR link" for cloud-sourced chips: that PR stays hidden, a
		// different PR still shows.
		suppressedPullRequestUrl: z.string().nullable().default(null),
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
	workspaceRunTerminals: z
		.record(z.string(), workspaceRunTerminalStateSchema)
		.default({}),
	// v1->v2 migration: terminals to recreate lazily on first workspace open
	// (D2 in plans/20260716-v1-to-v2-auto-migration.md). Cleared after the
	// sessions are created; panes come from useAutoAdoptBackgroundSessions.
	pendingMigratedTerminals: z
		.array(
			z.object({
				terminalId: z.string(),
				cwd: z.string().nullable().default(null),
				// Source v1 pane — lets creation seed the pane's captured agent
				// session as a resume candidate. Null on pre-existing entries.
				v1PaneId: z.string().nullable().default(null),
			}),
		)
		.default([]),
	// Terminal presets tagged "auto-run on workspace creation" that matched
	// this workspace's project when the create resolved. Presets live in
	// renderer localStorage, so the host can't run them; the v2 workspace
	// page drains this queue once on first open (see
	// useRunWorkspaceCreationPresets) and clears it before running.
	pendingCreationPresetIds: z.array(z.string()).default([]),
});

// Defaults for fields heal can synthesize. Identity fields (workspaceId,
// createdAt, paneLayout, sidebarState.projectId) intentionally absent — they
// must come from the stored row.
const SIDEBAR_STATE_DEFAULTS = {
	tabOrder: 0,
	sectionId: null,
	changesFilter: { kind: "all" },
	changesViewMode: "folders",
	activeTab: "changes",
	isHidden: false,
	pinnedAt: null,
	suppressedPullRequestUrl: null,
} as const;

const WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS = {
	viewedFiles: [] as string[],
	recentlyViewedFiles: [] as Array<{
		relativePath: string;
		absolutePath: string;
		lastAccessedAt: number;
	}>,
	workspaceRunTerminals: {} as Record<
		string,
		z.infer<typeof workspaceRunTerminalStateSchema>
	>,
	pendingMigratedTerminals: [] as Array<{
		terminalId: string;
		cwd: string | null;
		v1PaneId: string | null;
	}>,
	pendingCreationPresetIds: [] as string[],
};

/**
 * A sidebar group ("section" historically — the persisted key and field names
 * keep that spelling so existing rows parse untouched). Sections are flat and
 * project-scoped: one level of grouping inside a project.
 */
export const dashboardSidebarSectionSchema = z.object({
	// Widened from uuid: tag-backed folders use the composite key
	// `${projectId}:${tag}` (see utils/workspaceTagFolders). Widening only —
	// withReadHeal DELETES rows that fail parse, so this schema must keep
	// accepting every previously persisted shape.
	sectionId: z.string().min(1),
	// A project id, or the Sessions tag scope: the Sessions lane stores its
	// folder rows (order, collapse) under that scope since it has no project.
	projectId: tagFolderScopeInputSchema,
	name: z.string().trim().min(1),
	createdAt: persistedDateSchema,
	tabOrder: z.number().int().default(0),
	isCollapsed: z.boolean().default(false),
	color: z.string().nullable().default(null),
	// Null = legacy folder that owns members via sidebarState.sectionId; a
	// non-null tag makes the folder tag-backed (membership from host tags,
	// sectionId pointers at it are ignored). Default covers rows persisted
	// before the field existed.
	tag: z.string().nullable().default(null),
});

const v2ExecutionModeSchema = z.enum([
	"split-pane",
	"new-tab",
	"new-tab-split-pane",
	"sequential",
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
	useAsWorkspaceRun: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: v2ExecutionModeSchema.default("new-tab"),
	tabOrder: z.number().int().default(0),
	createdAt: persistedDateSchema,
	// When set, the preset is live-linked to a host-service agent config id.
	// Older rows may still contain a builtin preset id; the launcher/editor
	// support that as a fallback. The stored `commands` array is a snapshot
	// fallback for when the agent is missing or disabled.
	agentId: z.string().optional(),
});

export type DashboardSidebarProjectRow = z.infer<
	typeof dashboardSidebarProjectSchema
>;
export type WorkspaceLocalStateRow = z.infer<typeof workspaceLocalStateSchema>;
export type WorkspaceRunState = z.infer<typeof workspaceRunStateSchema>;
export type WorkspaceRunTerminalState = z.infer<
	typeof workspaceRunTerminalStateSchema
>;
export type DashboardSidebarSectionRow = z.infer<
	typeof dashboardSidebarSectionSchema
>;
export type V2TerminalPresetRow = z.infer<typeof v2TerminalPresetSchema>;

/**
 * Singleton row of v2 user-scoped preferences.
 *
 * fileLinks / urlLinks / sidebarFileLinks map click tiers
 * (plain, ⇧, ⌘, ⌘⇧) to an action:
 *   - null        → tier is unbound (surfaces show a hint or no-op)
 *   - "pane"      → open in current tab/pane (file viewer, in-app browser)
 *   - "newTab"    → open in a new tab/pane
 *   - "external"  → open in the external app (editor / system browser)
 *
 * Surfaces:
 *   - fileLinks / urlLinks: links embedded in terminal output and markdown.
 *     Terminal reads all 4 tiers; 2-tier surfaces (chat, task markdown)
 *     collapse shift→plain and metaShift→meta.
 *   - sidebarFileLinks: file rows in the sidebar (tree, changes, diff header).
 *
 * portOpenAction is a single action (not a tier map) for detected-port
 * badges: "pane" = in-app browser, "newTab" = new in-app tab,
 * "external" = system browser.
 *
 * Resolution and labels live in src/renderer/lib/clickPolicy.
 */
const linkActionSchema = z.enum(["pane", "newTab", "external"]);

export type LinkAction = z.infer<typeof linkActionSchema>;

const linkTierMapSchema = z.object({
	plain: linkActionSchema.nullable(),
	shift: linkActionSchema.nullable(),
	meta: linkActionSchema.nullable(),
	metaShift: linkActionSchema.nullable(),
});

export type LinkTierMap = z.infer<typeof linkTierMapSchema>;
export type LinkTier = keyof LinkTierMap;

const DEFAULT_LINK_TIER_MAP: LinkTierMap = {
	plain: null,
	shift: null,
	meta: "pane",
	metaShift: "external",
};

const DEFAULT_URL_LINKS: LinkTierMap = {
	plain: null,
	shift: "newTab",
	meta: "pane",
	metaShift: "external",
};

const LEGACY_SIDEBAR_FILE_LINKS: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "external",
	metaShift: "external",
};

const DEFAULT_SIDEBAR_FILE_LINKS: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "pane",
	metaShift: "external",
};

/**
 * Folder links (terminal output) have their own action set — folders can't
 * open in the file viewer, so the choices are reveal-in-sidebar, external
 * editor, or Finder. Sidebar folder rows stay hardcoded (folderIntentFor);
 * this map drives terminal folder links only.
 */
const folderLinkActionSchema = z.enum(["reveal", "external", "finder"]);

export type FolderLinkAction = z.infer<typeof folderLinkActionSchema>;

const folderTierMapSchema = z.object({
	plain: folderLinkActionSchema.nullable(),
	shift: folderLinkActionSchema.nullable(),
	meta: folderLinkActionSchema.nullable(),
	metaShift: folderLinkActionSchema.nullable(),
});

export type FolderTierMap = z.infer<typeof folderTierMapSchema>;

const DEFAULT_FOLDER_LINKS: FolderTierMap = {
	plain: null,
	shift: "finder",
	meta: "reveal",
	metaShift: "external",
};

// Clicking a port badge's open affordance opens http://localhost:<port>.
// A single action chooses where: "pane" = in-app browser, "newTab" = new
// in-app tab, "external" = system browser.
const DEFAULT_PORT_OPEN_ACTION: LinkAction = "external";

function isSameLinkTierMap(a: LinkTierMap, b: LinkTierMap): boolean {
	return (
		a.plain === b.plain &&
		a.shift === b.shift &&
		a.meta === b.meta &&
		a.metaShift === b.metaShift
	);
}

function isCompleteLinkTierMap(
	value: Partial<LinkTierMap>,
): value is LinkTierMap {
	return (
		"plain" in value &&
		"shift" in value &&
		"meta" in value &&
		"metaShift" in value
	);
}

const sidebarProjectSortModeSchema = z.enum(["manual", "active", "created"]);

export type SidebarProjectSortMode = z.infer<
	typeof sidebarProjectSortModeSchema
>;

// `.catch`, not `.default`: #5956 persisted a since-retired "updated" value
// for some users, and an enum failure must degrade to manual rather than
// drop the whole preferences row. Also applied at heal time (below) because
// the localStorage collection only runs the schema on writes.
const persistedSidebarProjectSortModeSchema =
	sidebarProjectSortModeSchema.catch("manual");

export const v2UserPreferencesSchema = z.object({
	id: z.literal("preferences"),
	fileLinks: linkTierMapSchema.default(DEFAULT_LINK_TIER_MAP),
	urlLinks: linkTierMapSchema.default(DEFAULT_URL_LINKS),
	sidebarFileLinks: linkTierMapSchema.default(DEFAULT_SIDEBAR_FILE_LINKS),
	folderLinks: folderTierMapSchema.default(DEFAULT_FOLDER_LINKS),
	portOpenAction: linkActionSchema.default(DEFAULT_PORT_OPEN_ACTION),
	terminalPresetsInitialized: z.boolean().default(false),
	rightSidebarOpen: z.boolean().default(true),
	rightSidebarTab: z.enum(["changes", "files"]).default("changes"),
	rightSidebarWidth: z.number().default(340),
	deleteLocalBranch: z.boolean().default(false),
	showPresetsBar: z.boolean().default(true),
	// Ordering of the dashboard sidebar's Projects list; manual = drag order.
	sidebarProjectSortMode: persistedSidebarProjectSortModeSchema,
	// Built-in (synthetic, app-shipped) presets the user hid from the preset
	// bar. Synthetic presets have no v2TerminalPresets row, so visibility can't
	// live on the row's pinnedToBar like user presets. Pruned against
	// KNOWN_BUILTIN_PRESET_IDS at heal time so retired ids can't persist.
	hiddenBuiltinPresetIds: z.array(z.string()).default([]),
	favoritePageIds: z.array(z.string()).default([]),
	// Per-project tags whose folders the user hid ("Hide folder" — hides the
	// grouping without untagging anyone). Bounded by tags a user has ever
	// hidden; entries for tags no longer in use are harmless and cheap.
	hiddenTagFolders: z.record(z.string(), z.array(z.string())).default({}),
});

// The fixed set of built-in preset ids. Consumers derive their id constants
// from this list (compile-checked via `satisfies`) so the heal-time pruning
// below can never drop an id that is still in use.
export const KNOWN_BUILTIN_PRESET_IDS = ["superset-cli"] as const;

export const MAX_FAVORITE_PAGE_IDS = 200;

export type V2UserPreferencesRow = z.infer<typeof v2UserPreferencesSchema>;

export const V2_USER_PREFERENCES_ID = "preferences" as const;

export const DEFAULT_V2_USER_PREFERENCES: V2UserPreferencesRow = {
	id: V2_USER_PREFERENCES_ID,
	fileLinks: DEFAULT_LINK_TIER_MAP,
	urlLinks: DEFAULT_URL_LINKS,
	sidebarFileLinks: DEFAULT_SIDEBAR_FILE_LINKS,
	folderLinks: DEFAULT_FOLDER_LINKS,
	portOpenAction: DEFAULT_PORT_OPEN_ACTION,
	terminalPresetsInitialized: false,
	rightSidebarOpen: true,
	rightSidebarTab: "changes",
	rightSidebarWidth: 340,
	deleteLocalBranch: false,
	showPresetsBar: true,
	sidebarProjectSortMode: "manual",
	hiddenBuiltinPresetIds: [],
	favoritePageIds: [],
	hiddenTagFolders: {},
};

/**
 * Heal a stored workspaceLocalState row against current defaults. Identity
 * fields (workspaceId, projectId, paneLayout, createdAt) pass through from
 * the stored row — they have no synthesizable default. Optional fields with
 * intrinsic defaults get filled at both the top level and inside sidebarState.
 */
export function healWorkspaceLocalState(raw: unknown): WorkspaceLocalStateRow {
	const r = (
		raw && typeof raw === "object" ? raw : {}
	) as Partial<WorkspaceLocalStateRow>;
	const sidebar = (
		r.sidebarState && typeof r.sidebarState === "object" ? r.sidebarState : {}
	) as Partial<WorkspaceLocalStateRow["sidebarState"]>;
	return {
		...r,
		// Heal a malformed/legacy persisted layout so consumers never render an
		// undefined node. Passed through untouched before, which white-screened
		// the workspace view on a corrupt layout.
		paneLayout: sanitizePaneLayout(r.paneLayout),
		viewedFiles:
			r.viewedFiles ?? WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.viewedFiles,
		recentlyViewedFiles:
			r.recentlyViewedFiles ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.recentlyViewedFiles,
		workspaceRunTerminals:
			r.workspaceRunTerminals ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.workspaceRunTerminals,
		pendingMigratedTerminals:
			r.pendingMigratedTerminals ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.pendingMigratedTerminals,
		pendingCreationPresetIds:
			r.pendingCreationPresetIds ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.pendingCreationPresetIds,
		sidebarState: {
			...SIDEBAR_STATE_DEFAULTS,
			...sidebar,
			activeTab: WORKSPACE_SIDEBAR_TAB_SCHEMA.catch("changes").parse(
				sidebar.activeTab,
			),
		} as WorkspaceLocalStateRow["sidebarState"],
	} as WorkspaceLocalStateRow;
}

/**
 * Heal a stored v2 user-preferences row against current defaults. Used by the
 * localStorage collection's read-time parser so rows persisted before a field
 * was added (top-level or nested in a LinkTierMap) don't surface as undefined
 * to consumers. Per-tier defaults vary by map, so we deep-merge each tier map
 * against its own default rather than relying on a single Zod default.
 */
export function healV2UserPreferences(raw: unknown): V2UserPreferencesRow {
	const r = (
		raw && typeof raw === "object" ? raw : {}
	) as Partial<V2UserPreferencesRow>;
	const sidebarFileLinks = r.sidebarFileLinks
		? {
				...DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
				...r.sidebarFileLinks,
			}
		: DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks;
	const shouldMigrateLegacySidebarFileLinks =
		r.sidebarFileLinks &&
		isCompleteLinkTierMap(r.sidebarFileLinks) &&
		isSameLinkTierMap(r.sidebarFileLinks, LEGACY_SIDEBAR_FILE_LINKS);
	// A stored map identical to the retired default was never customized —
	// swap it for the current default (shift gained "newTab").
	const shouldMigrateLegacyUrlLinks =
		r.urlLinks &&
		isCompleteLinkTierMap(r.urlLinks) &&
		isSameLinkTierMap(r.urlLinks, DEFAULT_LINK_TIER_MAP);
	return {
		...DEFAULT_V2_USER_PREFERENCES,
		...r,
		fileLinks: { ...DEFAULT_V2_USER_PREFERENCES.fileLinks, ...r.fileLinks },
		urlLinks: shouldMigrateLegacyUrlLinks
			? DEFAULT_V2_USER_PREFERENCES.urlLinks
			: { ...DEFAULT_V2_USER_PREFERENCES.urlLinks, ...r.urlLinks },
		sidebarFileLinks: shouldMigrateLegacySidebarFileLinks
			? DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks
			: sidebarFileLinks,
		folderLinks: {
			...DEFAULT_V2_USER_PREFERENCES.folderLinks,
			...r.folderLinks,
		},
		sidebarProjectSortMode: persistedSidebarProjectSortModeSchema.parse(
			r.sidebarProjectSortMode,
		),
		// Prune retired/stray built-in ids so the array stays bounded.
		hiddenBuiltinPresetIds: (Array.isArray(r.hiddenBuiltinPresetIds)
			? r.hiddenBuiltinPresetIds
			: []
		).filter((id) =>
			(KNOWN_BUILTIN_PRESET_IDS as readonly string[]).includes(id),
		),
		favoritePageIds: (Array.isArray(r.favoritePageIds) ? r.favoritePageIds : [])
			.filter((id): id is string => typeof id === "string" && id.length > 0)
			.slice(-MAX_FAVORITE_PAGE_IDS),
	};
}

export type WorkspacesCreateInput =
	inferRouterInputs<AppRouter>["workspaces"]["create"];

/** Session create — projectId pinned to null so submit can discriminate. */
export type WorkspacesCreateSessionInput =
	inferRouterInputs<AppRouter>["workspaces"]["createSession"] & {
		projectId: null;
	};

export type WorkspacesCreateAnyInput =
	| WorkspacesCreateInput
	| WorkspacesCreateSessionInput;

export const failedWorkspaceCreateSchema = z.object({
	id: z.string().uuid(),
	hostId: z.string(),
	input: z.custom<WorkspacesCreateAnyInput>(),
	error: z.string(),
	failedAt: persistedDateSchema,
});

export type FailedWorkspaceCreateRow = z.infer<
	typeof failedWorkspaceCreateSchema
>;
