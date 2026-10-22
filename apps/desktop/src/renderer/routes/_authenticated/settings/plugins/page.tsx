import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { OrganizationPluginsSettings } from "./components/OrganizationPluginsSettings";

export const Route = createFileRoute("/_authenticated/settings/plugins/")({
	component: OrganizationPluginsSettingsPage,
});

function OrganizationPluginsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "plugins").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <OrganizationPluginsSettings visibleItems={visibleItems} />;
}
