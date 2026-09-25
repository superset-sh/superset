import { useEffect } from "react";
import { env } from "renderer/env.renderer";
import { useAccessibleWorkspaces } from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const SEED_FLAG_KEY = "superset:dev:v2-sidebar-seeded";

/**
 * Auto-pins accessible workspaces in dev so a fresh worktree's sidebar
 * isn't blank. Chromium's localStorage is per-origin: the dev Vite origin
 * (`http://localhost:<port>`) can't share data with the packaged `file://`
 * origin, so copying prod's leveldb seeds the wrong namespace. We pin at
 * runtime instead. The flag prevents re-pinning workspaces the user later
 * unpins.
 */
export function useDevSeedSidebar(): void {
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const { all: accessibleWorkspaces } = useAccessibleWorkspaces();

	useEffect(() => {
		if (env.NODE_ENV !== "development") return;
		if (window.localStorage.getItem(SEED_FLAG_KEY) === "1") return;
		if (accessibleWorkspaces.length === 0) return;
		if (collections.workspaceLocalState.state.size > 0) {
			window.localStorage.setItem(SEED_FLAG_KEY, "1");
			return;
		}

		for (const workspace of accessibleWorkspaces) {
			ensureWorkspaceInSidebar(workspace.id, workspace.projectId);
		}
		window.localStorage.setItem(SEED_FLAG_KEY, "1");
	}, [accessibleWorkspaces, collections, ensureWorkspaceInSidebar]);
}
