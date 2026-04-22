import { useEffect } from "react";
import { env } from "renderer/env.renderer";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const SEED_FLAG_KEY = "superset:dev:v2-sidebar-seeded";

/**
 * On first dev launch in a fresh worktree, the v2 sidebar localStorage
 * (`v2WorkspaceLocalState`) is empty even when the cloud has plenty of
 * accessible workspaces — Chromium localStorage is per-origin and the dev
 * Vite origin (`http://localhost:<port>`) doesn't share data with the
 * packaged-app `file://` origin. Seeding the leveldb file from prod userData
 * doesn't help for the same reason.
 *
 * This hook auto-pins every accessible workspace once per worktree's dev
 * userData so the sidebar isn't blank. The flag in localStorage prevents
 * re-pinning workspaces the user has explicitly unpinned later.
 */
export function useDevSeedV2Sidebar(): void {
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
}
