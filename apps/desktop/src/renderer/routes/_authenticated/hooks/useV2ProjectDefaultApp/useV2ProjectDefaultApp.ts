import type { ExternalApp } from "@superset/local-db";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Single source of truth for the v2 per-project "open in" app choice —
 * the value the user picked via the CMD+O menu in `V2OpenInMenuButton`.
 *
 * v2 stores this client-side in `v2SidebarProjects.defaultOpenInApp`
 * (tanstack-db) because v2 projects are not in the v1 localDb tables
 * that the server-side `resolveDefaultEditor` consults. Anywhere v2 code
 * needs to read or write this preference should go through this hook so
 * CMD+O and file-open flows stay in sync.
 */
export function useV2ProjectDefaultApp(projectId: string | undefined) {
	const collections = useCollections();
	const { ensureProjectInSidebar } = useDashboardSidebarState();

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sp: collections.v2SidebarProjects })
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
			collections.v2SidebarProjects.update(projectId, (draft) => {
				draft.defaultOpenInApp = next;
			});
		},
		[collections, ensureProjectInSidebar, projectId],
	);

	return { app, setApp };
}
