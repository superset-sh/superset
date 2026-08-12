import type { AppRouter as HostServiceAppRouter } from "@superset/host-service";
import { BasicIndex } from "@tanstack/db";
import type {
	Collection,
	LocalStorageCollectionUtils,
} from "@tanstack/react-db";
import {
	createCollection,
	localStorageCollectionOptions,
} from "@tanstack/react-db";
import type { inferRouterOutputs } from "@trpc/server";
import { reclaimTerminalStateForQuota } from "renderer/lib/terminal/terminal-buffer-gc";
import type { z } from "zod";
import {
	type DashboardSidebarProjectRow,
	type DashboardSidebarSectionRow,
	dashboardSidebarProjectSchema,
	dashboardSidebarSectionSchema,
	type FailedWorkspaceCreateRow,
	failedWorkspaceCreateSchema,
	healV2UserPreferences,
	healWorkspaceLocalState,
	type V2TerminalPresetRow,
	type V2UserPreferencesRow,
	v2TerminalPresetSchema,
	v2UserPreferencesSchema,
	type WorkspaceLocalStateRow,
	type WorkspacesCreateInput,
	workspaceLocalStateSchema,
} from "./dashboardSidebarLocal";
import { evictInactiveOrgs } from "./evictInactiveOrgs";
import { notifyQuotaExhausted } from "./notifyQuotaExhausted";
import { withQuotaGuard } from "./withQuotaGuard";
import { withReadHeal } from "./withReadHeal";

type HostWorkspacesCreateResult =
	inferRouterOutputs<HostServiceAppRouter>["workspaces"]["create"];

export interface WorkspaceCreateMutationMetadata {
	hostUrl: string;
	input: WorkspacesCreateInput;
	result?: HostWorkspacesCreateResult;
	[key: string]: unknown;
}

const indexDefaults = {
	autoIndex: "eager",
	defaultIndexType: BasicIndex,
} as const;
const basicIndexConfig = { indexType: BasicIndex } as const;

const createIndexedCollection = ((
	config: Parameters<typeof createCollection>[0],
) =>
	createCollection({ ...config, ...indexDefaults })) as typeof createCollection;

/**
 * Applied to every localStorage-backed collection:
 * - `startSync: true` + `gcTime: 0`: hydrate at construction, never GC. The
 *   sidebar mutation helpers read `.state` non-reactively, and a write into a
 *   not-yet-hydrated (or GC'd) collection rewrites the whole storage key from
 *   empty memory — erasing every persisted row for the org.
 * - `withReadHeal`: per-row tolerant reads — one malformed entry escaping to
 *   the library's hydration catch-all would blank the entire store.
 * - `withQuotaGuard`: an exhausted store drops the write instead of throwing,
 *   which is what stops the rollback/retry loop that freezes the renderer.
 */
const hardenLocalCollection = <T>(
	options: T,
	heal?: (raw: unknown) => unknown,
): T =>
	withQuotaGuard(
		withReadHeal({ ...options, startSync: true, gcTime: 0 } as T, heal),
		{
			// Oldest-first by the terminal GC's persisted-at index (24h pressure TTL)
			// — survives relaunches, unlike registry membership.
			reclaim: () => reclaimTerminalStateForQuota(),
			// Not passed by reference: the guard's second argument is the error, which
			// would land in the notice's optional `mode` slot.
			onPersistFailed: (storageKey) => notifyQuotaExhausted(storageKey),
		},
	);

export interface OrgCollections {
	v2SidebarProjects: Collection<
		DashboardSidebarProjectRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarProjectSchema,
		z.input<typeof dashboardSidebarProjectSchema>
	>;
	v2WorkspaceLocalState: Collection<
		WorkspaceLocalStateRow,
		string,
		LocalStorageCollectionUtils,
		typeof workspaceLocalStateSchema,
		z.input<typeof workspaceLocalStateSchema>
	>;
	v2SidebarSections: Collection<
		DashboardSidebarSectionRow,
		string,
		LocalStorageCollectionUtils,
		typeof dashboardSidebarSectionSchema,
		z.input<typeof dashboardSidebarSectionSchema>
	>;
	v2TerminalPresets: Collection<
		V2TerminalPresetRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2TerminalPresetSchema,
		z.input<typeof v2TerminalPresetSchema>
	>;
	v2UserPreferences: Collection<
		V2UserPreferencesRow,
		string,
		LocalStorageCollectionUtils,
		typeof v2UserPreferencesSchema,
		z.input<typeof v2UserPreferencesSchema>
	>;
	failedWorkspaceCreates: Collection<
		FailedWorkspaceCreateRow,
		string,
		LocalStorageCollectionUtils,
		typeof failedWorkspaceCreateSchema,
		z.input<typeof failedWorkspaceCreateSchema>
	>;
}

// Per-org collections cache
const collectionsCache = new Map<string, OrgCollections>();

function getCollectionsCacheKey(organizationId: string): string {
	return organizationId;
}

function createOrgCollections(organizationId: string): OrgCollections {
	const v2SidebarProjects = createIndexedCollection(
		localStorageCollectionOptions(
			hardenLocalCollection({
				id: `v2_sidebar_projects-${organizationId}`,
				storageKey: `v2-sidebar-projects-${organizationId}`,
				schema: dashboardSidebarProjectSchema,
				// Explicit type for the same reason `withReadHeal` needs one: a
				// passthrough generic drops the contextual typing that would
				// otherwise narrow the key to string.
				getKey: (item: DashboardSidebarProjectRow) => item.projectId,
			}),
		),
	);
	v2SidebarProjects.createIndex(
		(sidebarProject) => sidebarProject.tabOrder,
		basicIndexConfig,
	);

	const v2WorkspaceLocalState = createIndexedCollection(
		localStorageCollectionOptions(
			hardenLocalCollection(
				{
					id: `v2_workspace_local_state-${organizationId}`,
					storageKey: `v2-workspace-local-state-${organizationId}`,
					schema: workspaceLocalStateSchema,
					// Explicit type so `withReadHeal`'s passthrough generic keeps the
					// linkage between schema and getKey for downstream inference.
					getKey: (item: WorkspaceLocalStateRow) => item.workspaceId,
				},
				healWorkspaceLocalState,
			),
		),
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.projectId,
		basicIndexConfig,
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.sectionId,
		basicIndexConfig,
	);
	v2WorkspaceLocalState.createIndex(
		(localState) => localState.sidebarState.tabOrder,
		basicIndexConfig,
	);

	const v2SidebarSections = createIndexedCollection(
		localStorageCollectionOptions(
			hardenLocalCollection({
				id: `v2_sidebar_sections-${organizationId}`,
				storageKey: `v2-sidebar-sections-${organizationId}`,
				schema: dashboardSidebarSectionSchema,
				getKey: (item: DashboardSidebarSectionRow) => item.sectionId,
			}),
		),
	);
	v2SidebarSections.createIndex(
		(section) => section.projectId,
		basicIndexConfig,
	);
	v2SidebarSections.createIndex(
		(section) => section.tabOrder,
		basicIndexConfig,
	);

	const v2TerminalPresets = createIndexedCollection(
		localStorageCollectionOptions(
			hardenLocalCollection({
				id: `v2_terminal_presets-${organizationId}`,
				storageKey: `v2-terminal-presets-${organizationId}`,
				schema: v2TerminalPresetSchema,
				getKey: (item: V2TerminalPresetRow) => item.id,
			}),
		),
	);

	const v2UserPreferences = createCollection(
		localStorageCollectionOptions(
			hardenLocalCollection(
				{
					id: `v2_user_preferences-${organizationId}`,
					storageKey: `v2-user-preferences-${organizationId}`,
					schema: v2UserPreferencesSchema,
					// Cast widens the inferred literal "preferences" key to string so
					// the collection slots into the shared OrgCollections.{...<TKey=string>}
					// shape alongside the other v2 collections. Explicit `item` type so
					// `withReadHeal`'s passthrough generic keeps schema/getKey linkage.
					getKey: (item: V2UserPreferencesRow) => item.id as string,
				},
				healV2UserPreferences,
			),
		),
	);

	const failedWorkspaceCreates = createIndexedCollection(
		localStorageCollectionOptions(
			hardenLocalCollection({
				id: `failed_workspace_creates-${organizationId}`,
				storageKey: `failed-workspace-creates-${organizationId}`,
				schema: failedWorkspaceCreateSchema,
				getKey: (item: FailedWorkspaceCreateRow) => item.id,
			}),
		),
	);

	return {
		v2SidebarProjects,
		v2WorkspaceLocalState,
		v2SidebarSections,
		v2TerminalPresets,
		v2UserPreferences,
		failedWorkspaceCreates,
	};
}

/**
 * Warm every collection of an organization. localStorage collections hydrate
 * at construction (`startSync: true`); preload just surfaces failures early.
 */
export async function preloadCollections(
	organizationId: string,
): Promise<void> {
	const collections = getCollections(organizationId);
	for (const [name, collection] of Object.entries(collections)) {
		(collection as Collection<object>).preload().catch((error) => {
			console.error(`[collections] Preload failed: ${name}`, error);
		});
	}
}

/**
 * Get collections for an organization, creating them if needed.
 * Collections are cached per org for instant switching.
 */
export function getCollections(organizationId: string) {
	const cacheKey = getCollectionsCacheKey(organizationId);

	if (!collectionsCache.has(cacheKey)) {
		collectionsCache.set(cacheKey, createOrgCollections(organizationId));
	}

	const orgCollections = collectionsCache.get(cacheKey);
	if (!orgCollections) {
		throw new Error(`Collections not found for org: ${organizationId}`);
	}

	return { ...orgCollections };
}

/**
 * Evict the collection sets of every cached org except `activeOrganizationId`,
 * stopping their localStorage sync, clearing their in-memory rows, and
 * dropping them from the cache. Call this when the active org changes so
 * prior orgs stop holding their rows in the heap. Recovery is handled by
 * `getCollections`, which rebuilds fresh instances (rehydrating from the
 * untouched persisted rows) when an evicted org is re-entered.
 */
export function evictInactiveOrgCollections(
	activeOrganizationId: string,
): void {
	evictInactiveOrgs(
		collectionsCache as unknown as Map<string, Record<string, unknown>>,
		getCollectionsCacheKey(activeOrganizationId),
		(orgKey, collectionName, error) => {
			console.error(
				`[collections] Failed to clean up evicted collection ${collectionName} for org ${orgKey}`,
				error,
			);
		},
	);
}

export type AppCollections = ReturnType<typeof getCollections>;
