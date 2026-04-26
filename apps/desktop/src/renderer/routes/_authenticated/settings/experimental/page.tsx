import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ExperimentalSettings } from "./components/ExperimentalSettings";

export const Route = createFileRoute("/_authenticated/settings/experimental/")({
	component: ExperimentalSettingsPage,
});

function ExperimentalSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "experimental").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <ExperimentalSettings visibleItems={visibleItems} />;
}
