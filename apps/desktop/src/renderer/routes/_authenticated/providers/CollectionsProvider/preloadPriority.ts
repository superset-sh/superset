/**
 * Collection preload prioritization.
 *
 * Opening a workspace deep link in the desktop app must not be gated behind
 * hydration of heavy persisted collections (`tasks`, `github_pull_requests`,
 * and the `applied_tx` transaction history, which can grow to >100 MB). The
 * workspace shell and sidebar only need a handful of tiny collections
 * (`v2_workspaces`, `v2_hosts`, `v2_projects`, local sidebar state). When every
 * collection is preloaded in a single undifferentiated batch, those tiny
 * collections contend for the same SQLite/Electric I/O as the heavy ones, which
 * is the suspected cause of the 30-60s open delay reported in issue #5015.
 *
 * `partitionCollectionsForPreload` splits collections into a critical tier
 * (needed to render the workspace shell) and a deferred tier (everything else),
 * so callers can hydrate the critical tier first and let the rest catch up in
 * the background.
 */

/**
 * Collections required to render the workspace shell and sidebar. These are all
 * tiny (tens of rows) and must hydrate before the heavy collections so a
 * workspace deep link can open promptly.
 */
export const CRITICAL_PRELOAD_COLLECTION_NAMES = [
	"v2Workspaces",
	"v2Hosts",
	"v2Clients",
	"v2Projects",
	"v2UsersHosts",
	"v2WorkspaceLocalState",
	"v2SidebarProjects",
	"v2SidebarSections",
	"v2TerminalPresets",
	"v2UserPreferences",
	"failedWorkspaceCreates",
] as const;

/** Minimal structural type for a preloadable collection. */
export interface Preloadable {
	preload: () => Promise<unknown>;
}

/**
 * Split a map of collections into critical and deferred tiers. The
 * `organizations` collection is always skipped (it is shared across orgs and
 * preloaded separately), matching the original `preloadCollections` behavior.
 */
export function partitionCollectionsForPreload<T>(
	collections: Record<string, T>,
	criticalNames: readonly string[] = CRITICAL_PRELOAD_COLLECTION_NAMES,
): { critical: T[]; deferred: T[] } {
	const criticalSet = new Set(criticalNames);
	const critical: T[] = [];
	const deferred: T[] = [];

	for (const [name, collection] of Object.entries(collections)) {
		if (name === "organizations") continue;
		if (criticalSet.has(name)) {
			critical.push(collection);
		} else {
			deferred.push(collection);
		}
	}

	return { critical, deferred };
}

/**
 * Preload collections in two tiers. The returned promise resolves once the
 * critical tier has settled; the deferred tier is started in the background and
 * intentionally not awaited so route open isn't blocked behind heavy
 * collections.
 */
export async function preloadCollectionsInTiers<T extends Preloadable>(
	collections: Record<string, T>,
	criticalNames: readonly string[] = CRITICAL_PRELOAD_COLLECTION_NAMES,
): Promise<void> {
	const { critical, deferred } = partitionCollectionsForPreload(
		collections,
		criticalNames,
	);

	await Promise.allSettled(critical.map((c) => c.preload()));

	// Kick off the heavy collections without blocking; they reconcile in the
	// background while the workspace shell is already interactive.
	void Promise.allSettled(deferred.map((c) => c.preload()));
}
