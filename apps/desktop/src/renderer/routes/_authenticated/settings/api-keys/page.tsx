import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ApiKeysSettings } from "./components/ApiKeysSettings";

export const Route = createFileRoute("/_authenticated/settings/api-keys/")({
	component: ApiKeysSettingsPage,
});

function ApiKeysSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "apikeys").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <ApiKeysSettings visibleItems={visibleItems} />;
}
