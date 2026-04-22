import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	DEFAULT_V2_USER_PREFERENCES,
	type LinkTierMap,
	V2_USER_PREFERENCES_ID,
	type V2UserPreferencesRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export interface V2UserPreferencesApi {
	preferences: V2UserPreferencesRow;
	setFileLinks: (next: LinkTierMap) => void;
	setUrlLinks: (next: LinkTierMap) => void;
}

export function useV2UserPreferences(): V2UserPreferencesApi {
	const collections = useCollections();

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ prefs: collections.v2UserPreferences })
				.where(({ prefs }) => eq(prefs.id, V2_USER_PREFERENCES_ID)),
		[collections],
	);

	const preferences = rows[0] ?? DEFAULT_V2_USER_PREFERENCES;

	const upsertTierMap = useCallback(
		(key: "fileLinks" | "urlLinks", next: LinkTierMap) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					[key]: next,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
				draft[key] = next;
			});
		},
		[collections],
	);

	const setFileLinks = useCallback(
		(next: LinkTierMap) => upsertTierMap("fileLinks", next),
		[upsertTierMap],
	);

	const setUrlLinks = useCallback(
		(next: LinkTierMap) => upsertTierMap("urlLinks", next),
		[upsertTierMap],
	);

	return { preferences, setFileLinks, setUrlLinks };
}
