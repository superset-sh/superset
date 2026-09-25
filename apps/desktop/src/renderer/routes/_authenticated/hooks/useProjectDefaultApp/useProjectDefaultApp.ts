import type { ExternalApp } from "@superset/local-db";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Single source of truth for the per-project "open in" app choice —
 * the value the user picked via the CMD+O menu in `OpenInMenuButton`.
 *
 * Stored client-side in `sidebarProjects.defaultOpenInApp` (tanstack-db);
 * the server-side `resolveDefaultEditor` only knows the global default.
 * Anywhere that needs to read or write this preference should go through
 * this hook so CMD+O and file-open flows stay in sync.
 */
export function useProjectDefaultApp(projectId: string | undefined) {
	const collections = useCollections();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.sidebarProjects })
				.where(({ sp }) => eq(sp.projectId, projectId ?? ""))
				.select(({ sp }) => ({ defaultOpenInApp: sp.defaultOpenInApp })),
		[collections, projectId],
	);
	const app =
		(rows[0]?.defaultOpenInApp as ExternalApp | null | undefined) ?? undefined;

	const setApp = useCallback(
		(next: ExternalApp) => {
			if (!projectId) return;
			ensureProjectInSidebar(projectId);
			collections.sidebarProjects.update(projectId, (draft) => {
				draft.defaultOpenInApp = next;
			});
		},
		[collections, ensureProjectInSidebar, projectId],
	);

	return { app, setApp };
}
