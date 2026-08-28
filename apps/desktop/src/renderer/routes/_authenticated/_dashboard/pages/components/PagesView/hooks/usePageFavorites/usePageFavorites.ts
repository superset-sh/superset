import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	DEFAULT_V2_USER_PREFERENCES,
	MAX_FAVORITE_PAGE_IDS,
	V2_USER_PREFERENCES_ID,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export interface PageFavoritesApi {
	favoritePageIds: string[];
	favoritePageIdSet: ReadonlySet<string>;
	isFavorite: (pageId: string) => boolean;
	setFavorite: (pageId: string, favorite: boolean) => void;
	toggleFavorite: (pageId: string) => void;
}

export function usePageFavorites(): PageFavoritesApi {
	const collections = useCollections();

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ prefs: collections.v2UserPreferences })
				.where(({ prefs }) => eq(prefs.id, V2_USER_PREFERENCES_ID)),
		[collections],
	);

	const favoritePageIds =
		rows[0]?.favoritePageIds ?? DEFAULT_V2_USER_PREFERENCES.favoritePageIds;

	const favoritePageIdSet = useMemo(
		() => new Set(favoritePageIds),
		[favoritePageIds],
	);

	const setFavorite = useCallback(
		(pageId: string, favorite: boolean) => {
			if (!pageId) return;
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			const prev =
				existing?.favoritePageIds ??
				DEFAULT_V2_USER_PREFERENCES.favoritePageIds;
			const next = favorite
				? prev.includes(pageId)
					? prev
					: [...prev, pageId].slice(-MAX_FAVORITE_PAGE_IDS)
				: prev.filter((id) => id !== pageId);
			if (next === prev) return;
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					favoritePageIds: next,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
				draft.favoritePageIds = next;
			});
		},
		[collections],
	);

	const isFavorite = useCallback(
		(pageId: string) => favoritePageIdSet.has(pageId),
		[favoritePageIdSet],
	);

	const toggleFavorite = useCallback(
		(pageId: string) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			const prev =
				existing?.favoritePageIds ??
				DEFAULT_V2_USER_PREFERENCES.favoritePageIds;
			setFavorite(pageId, !prev.includes(pageId));
		},
		[collections, setFavorite],
	);

	return {
		favoritePageIds,
		favoritePageIdSet,
		isFavorite,
		setFavorite,
		toggleFavorite,
	};
}
