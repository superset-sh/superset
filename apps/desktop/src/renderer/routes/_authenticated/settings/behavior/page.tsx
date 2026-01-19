import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { BehaviorSettings } from "./components/BehaviorSettings";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export const Route = createFileRoute("/_authenticated/settings/behavior/")({
	component: BehaviorSettingsPage,
});

function BehaviorSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "behavior").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <BehaviorSettings visibleItems={visibleItems} />;
}
