import { useEffect, useState } from "react";
import { env } from "renderer/env.renderer";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const SEED_FLAG_KEY = "superset:dev:v2-sidebar-seeded";

/**
 * Auto-pins accessible v2 workspaces in dev so a fresh worktree's sidebar
 * isn't blank. Mounted only in development: the accessible-workspace list
 * subscribes to every workspace, host status and PR query, so mounting it in
 * production would re-render its parent on every host-workspace change. Chromium's localStorage is per-origin: the dev Vite origin
 * (`http://localhost:<port>`) can't share data with the packaged `file://`
 * origin, so copying prod's leveldb seeds the wrong namespace. We pin at
 * runtime instead. The flag prevents re-pinning workspaces the user later
 * unpins.
 */
function DevSeedV2SidebarEffect(): null {
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { all: accessibleWorkspaces } = useAccessibleV2Workspaces();

	useEffect(() => {
		if (env.NODE_ENV !== "development") return;
		if (window.localStorage.getItem(SEED_FLAG_KEY) === "1") return;
		if (accessibleWorkspaces.length === 0) return;
		if (collections.v2WorkspaceLocalState.state.size > 0) {
			window.localStorage.setItem(SEED_FLAG_KEY, "1");
			return;
		}

		for (const workspace of accessibleWorkspaces) {
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		}
		window.localStorage.setItem(SEED_FLAG_KEY, "1");
	}, [accessibleWorkspaces, collections, ensureWorkspaceInSidebar]);

	return null;
}

/**
 * The seed runs once per profile; after the flag is set nothing is mounted,
 * so a seeded dev profile pays no subscription cost either.
 */
export function DevSeedV2Sidebar() {
	const [seeded] = useState(
		() => window.localStorage.getItem(SEED_FLAG_KEY) === "1",
	);
	return seeded ? null : <DevSeedV2SidebarEffect />;
}
