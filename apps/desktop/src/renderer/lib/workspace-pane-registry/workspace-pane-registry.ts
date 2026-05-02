import {
	createWorkspaceStore,
	type WorkspaceState,
	type WorkspaceStore,
} from "@superset/panes";
import type {
	Collection,
	LocalStorageCollectionUtils,
} from "@tanstack/react-db";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import type {
	WorkspaceLocalStateRow,
	workspaceLocalStateSchema,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { z } from "zod";
import type { StoreApi } from "zustand/vanilla";

type V2WorkspaceLocalStateCollection = Collection<
	WorkspaceLocalStateRow,
	string,
	LocalStorageCollectionUtils,
	typeof workspaceLocalStateSchema,
	z.input<typeof workspaceLocalStateSchema>
>;

export interface WorkspacePaneRegistryDeps {
	v2WorkspaceLocalState: V2WorkspaceLocalStateCollection;
}

interface RegistryEntry {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	unsubscribeStore: () => void;
	unsubscribeCollection: () => void;
}

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

let deps: WorkspacePaneRegistryDeps | null = null;
const registry = new Map<string, RegistryEntry>();

/**
 * Deterministic JSON serialization with deep key sorting. Used to
 * compare store state against row state without false-positive
 * mismatches when the two paths produce structurally equal objects
 * but in different key orders (Immer `draft.paneLayout = ...` writes
 * via the collection do not preserve insertion order).
 */
function getSnapshot(value: unknown): string {
	return JSON.stringify(deepSortKeys(value));
}

function deepSortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(deepSortKeys);
	if (value && typeof value === "object") {
		const sorted: Record<string, unknown> = {};
		for (const k of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[k] = deepSortKeys((value as Record<string, unknown>)[k]);
		}
		return sorted;
	}
	return value;
}

/**
 * Wire the registry to the active org's collections. Call once at app
 * boot, after `CollectionsProvider` resolves an active organization.
 *
 * Calling this with a new `v2WorkspaceLocalState` collection instance
 * (e.g. after switching organizations) drops every existing store and
 * re-initializes against the new collection. Calling with the same
 * collection instance is a no-op — important because the call site
 * passes a fresh wrapper object each time, but the underlying
 * collection is what determines org identity. Without the
 * instance-level check, an accidental memo recomputation would silently
 * drop every live store.
 */
export function initWorkspacePaneRegistry(
	nextDeps: WorkspacePaneRegistryDeps,
): void {
	if (deps && deps.v2WorkspaceLocalState !== nextDeps.v2WorkspaceLocalState) {
		for (const entry of registry.values()) {
			entry.unsubscribeStore();
			entry.unsubscribeCollection();
		}
		registry.clear();
	}
	deps = nextDeps;
}

/**
 * Get the pane store for `workspaceId`, creating + persisting-wiring it
 * on first call. Subsequent calls return the same store instance.
 *
 * Persistence: on first creation, the store is seeded from the matching
 * `v2WorkspaceLocalState` row (if present) and then bidirectionally
 * synced — store changes write back to the row (when it exists), and
 * external row changes push into the store. A snapshot guard prevents
 * the two from echoing each other.
 *
 * If the row doesn't exist yet, the write-back is silently skipped
 * (the row is normally inserted by `ensureWorkspaceInSidebar` on route
 * mount). Once the row appears, the next store change propagates.
 */
export function getOrCreateWorkspacePaneStore(
	workspaceId: string,
): StoreApi<WorkspaceStore<PaneViewerData>> {
	if (!deps) {
		throw new Error(
			"workspace-pane-registry not initialized — call initWorkspacePaneRegistry first",
		);
	}
	const activeDeps = deps;

	const existing = registry.get(workspaceId);
	if (existing) return existing.store;

	const initialRow = activeDeps.v2WorkspaceLocalState.get(workspaceId);
	const initialPaneLayout =
		(initialRow?.paneLayout as WorkspaceState<PaneViewerData> | undefined) ??
		EMPTY_STATE;

	const store = createWorkspaceStore<PaneViewerData>({
		initialState: initialPaneLayout,
	});
	let lastSyncedSnapshot = getSnapshot(initialPaneLayout);

	const unsubscribeStore = store.subscribe((next) => {
		const nextSnapshot = getSnapshot({
			version: next.version,
			tabs: next.tabs,
			activeTabId: next.activeTabId,
		});
		if (nextSnapshot === lastSyncedSnapshot) return;
		if (!activeDeps.v2WorkspaceLocalState.get(workspaceId)) {
			// Row not present yet (pre-mount or pre-migration). The next
			// change after the row is inserted will sync.
			return;
		}
		activeDeps.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.paneLayout = {
				version: next.version,
				tabs: next.tabs,
				activeTabId: next.activeTabId,
			};
		});
		lastSyncedSnapshot = nextSnapshot;
	});

	const subscription = activeDeps.v2WorkspaceLocalState.subscribeChanges(
		(changes) => {
			for (const change of changes) {
				if (change.key !== workspaceId) continue;
				if (change.type === "delete") continue;
				const layout = change.value?.paneLayout as
					| WorkspaceState<PaneViewerData>
					| undefined;
				if (!layout) continue;
				const incoming = getSnapshot(layout);
				const currentState = store.getState();
				const storeSnapshot = getSnapshot({
					version: currentState.version,
					tabs: currentState.tabs,
					activeTabId: currentState.activeTabId,
				});
				// Already in sync. (This branch also catches Tanstack DB's
				// initial-state `insert` events whose value matches what we
				// seeded from when the store was created.)
				if (incoming === storeSnapshot) {
					lastSyncedSnapshot = incoming;
					continue;
				}
				// Three-way reconciliation: incoming (row), storeSnapshot
				// (memory), and lastSyncedSnapshot (last seen agreement).
				//
				// If storeSnapshot !== lastSyncedSnapshot, the store has
				// unsynced mutations the row hasn't seen yet — typically
				// addLaunchPanes ran before the row existed, then
				// ensureWorkspaceInSidebar inserted the row with EMPTY
				// paneLayout. Push the store back so those panes persist.
				//
				// Otherwise, the row diverges from the store while the store
				// is still in sync with what we last wrote — the row was
				// modified externally (migration, future cross-tab sync).
				// Pull the row into the store.
				if (storeSnapshot !== lastSyncedSnapshot) {
					activeDeps.v2WorkspaceLocalState.update(workspaceId, (draft) => {
						draft.paneLayout = {
							version: currentState.version,
							tabs: currentState.tabs,
							activeTabId: currentState.activeTabId,
						};
					});
					lastSyncedSnapshot = storeSnapshot;
					continue;
				}
				lastSyncedSnapshot = incoming;
				store.getState().replaceState(layout);
			}
		},
	);

	registry.set(workspaceId, {
		store,
		unsubscribeStore,
		unsubscribeCollection: () => subscription.unsubscribe(),
	});
	return store;
}

/**
 * Drop the store for `workspaceId` and unsubscribe its sync. Called
 * when a workspace is removed; safe to call when no entry exists.
 */
export function dropWorkspacePaneStore(workspaceId: string): void {
	const entry = registry.get(workspaceId);
	if (!entry) return;
	entry.unsubscribeStore();
	entry.unsubscribeCollection();
	registry.delete(workspaceId);
}

/** Test-only: tear down all stores and clear the deps. */
export function __resetWorkspacePaneRegistryForTests(): void {
	for (const entry of registry.values()) {
		entry.unsubscribeStore();
		entry.unsubscribeCollection();
	}
	registry.clear();
	deps = null;
}
