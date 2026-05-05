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
		activeTab: z.enum(["changes", "files", "review"]).default("changes"),
		isHidden: z.boolean().default(false),
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

// Defaults for fields heal can synthesize. Identity fields (workspaceId,
// createdAt, paneLayout, sidebarState.projectId) intentionally absent — they
// must come from the stored row.
const SIDEBAR_STATE_DEFAULTS = {
	tabOrder: 0,
	sectionId: null,
	changesFilter: { kind: "all" },
	activeTab: "changes",
	isHidden: false,
} as const;

const WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS = {
	viewedFiles: [] as string[],
	recentlyViewedFiles: [] as Array<{
		relativePath: string;
		absolutePath: string;
		lastAccessedAt: number;
	}>,
};

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

export type DashboardSidebarProjectRow = z.infer<
	typeof dashboardSidebarProjectSchema
>;
export type WorkspaceLocalStateRow = z.infer<typeof workspaceLocalStateSchema>;
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
 *   - sidebarFileLinks: file rows in the sidebar (tree, changes, diff header)
 *     and similar in-app surfaces (port badges).
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

const DEFAULT_SIDEBAR_FILE_LINKS: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "external",
	metaShift: "external",
};

export const v2UserPreferencesSchema = z.object({
	id: z.literal("preferences"),
	fileLinks: linkTierMapSchema.default(DEFAULT_LINK_TIER_MAP),
	urlLinks: linkTierMapSchema.default(DEFAULT_LINK_TIER_MAP),
	sidebarFileLinks: linkTierMapSchema.default(DEFAULT_SIDEBAR_FILE_LINKS),
	rightSidebarOpen: z.boolean().default(true),
	rightSidebarTab: z.enum(["changes", "files"]).default("changes"),
	rightSidebarWidth: z.number().default(340),
	deleteLocalBranch: z.boolean().default(false),
});

export type V2UserPreferencesRow = z.infer<typeof v2UserPreferencesSchema>;

export const V2_USER_PREFERENCES_ID = "preferences" as const;

export const DEFAULT_V2_USER_PREFERENCES: V2UserPreferencesRow = {
	id: V2_USER_PREFERENCES_ID,
	fileLinks: DEFAULT_LINK_TIER_MAP,
	urlLinks: DEFAULT_LINK_TIER_MAP,
	sidebarFileLinks: DEFAULT_SIDEBAR_FILE_LINKS,
	rightSidebarOpen: true,
	rightSidebarTab: "changes",
	rightSidebarWidth: 340,
	deleteLocalBranch: false,
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
		viewedFiles:
			r.viewedFiles ?? WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.viewedFiles,
		recentlyViewedFiles:
			r.recentlyViewedFiles ??
			WORKSPACE_LOCAL_STATE_OPTIONAL_DEFAULTS.recentlyViewedFiles,
		sidebarState: {
			...SIDEBAR_STATE_DEFAULTS,
			...sidebar,
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
	return {
		...DEFAULT_V2_USER_PREFERENCES,
		...r,
		fileLinks: { ...DEFAULT_V2_USER_PREFERENCES.fileLinks, ...r.fileLinks },
		urlLinks: { ...DEFAULT_V2_USER_PREFERENCES.urlLinks, ...r.urlLinks },
		sidebarFileLinks: {
			...DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
			...r.sidebarFileLinks,
		},
	};
}
