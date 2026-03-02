import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { OrganizationSettings } from "./components/OrganizationSettings";

export const Route = createFileRoute("/_authenticated/settings/organization/")({
	component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "organization").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <OrganizationSettings visibleItems={visibleItems} />;
}
