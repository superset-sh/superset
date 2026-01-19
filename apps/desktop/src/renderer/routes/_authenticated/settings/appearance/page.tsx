import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppearanceSettings } from "./components/AppearanceSettings";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export const Route = createFileRoute("/_authenticated/settings/appearance/")({
	component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "appearance").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <AppearanceSettings visibleItems={visibleItems} />;
}
