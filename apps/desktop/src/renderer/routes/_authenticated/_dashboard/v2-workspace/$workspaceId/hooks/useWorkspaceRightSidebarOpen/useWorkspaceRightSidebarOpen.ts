import { FEATURE_FLAGS } from "@superset/shared/constants";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback } from "react";
import {
	useV2UserPreferences,
	type V2UserPreferencesApi,
} from "renderer/hooks/useV2UserPreferences";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useWorkspaceRightSidebarOpen(workspaceId: string): {
	isOpen: boolean;
	setOpen: V2UserPreferencesApi["setRightSidebarOpen"];
} {
	const collections = useCollections();
	const { preferences, setRightSidebarOpen } = useV2UserPreferences();
	const isPerWorkspace =
		useFeatureFlagEnabled(FEATURE_FLAGS.RIGHT_PANE_AREA) === true;
	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const workspaceOpen = rows.find(
		(row) => row.workspaceId === workspaceId,
	)?.rightSidebarOpen;
	const isOpen = isPerWorkspace
		? (workspaceOpen ?? preferences.rightSidebarOpen)
		: preferences.rightSidebarOpen;

	const setWorkspaceOpen = useCallback<
		V2UserPreferencesApi["setRightSidebarOpen"]
	>(
		(next) => {
			const row = collections.v2WorkspaceLocalState.get(workspaceId);
			if (!row) {
				setRightSidebarOpen(next);
				return;
			}
			const prev = row.rightSidebarOpen ?? preferences.rightSidebarOpen;
			const value = typeof next === "function" ? next(prev) : next;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.rightSidebarOpen = value;
			});
		},
		[
			collections,
			workspaceId,
			preferences.rightSidebarOpen,
			setRightSidebarOpen,
		],
	);

	return {
		isOpen,
		setOpen: isPerWorkspace ? setWorkspaceOpen : setRightSidebarOpen,
	};
}
