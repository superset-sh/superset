import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { EnvironmentsSettings } from "./components/EnvironmentsSettings";

export const Route = createFileRoute("/_authenticated/settings/environments/")({
	component: EnvironmentsSettingsPage,
});

function EnvironmentsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "environments").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <EnvironmentsSettings visibleItems={visibleItems} />;
}
