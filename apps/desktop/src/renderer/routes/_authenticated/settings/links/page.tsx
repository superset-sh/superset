import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { LinksSettings } from "./components/LinksSettings";

export const Route = createFileRoute("/_authenticated/settings/links/")({
	component: LinksSettingsPage,
});

function LinksSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "links").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <LinksSettings visibleItems={visibleItems} />;
}
