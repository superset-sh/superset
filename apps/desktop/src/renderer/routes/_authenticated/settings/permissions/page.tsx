import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search/settings-search";
import { PermissionsSettings } from "./components/PermissionsSettings";

export const Route = createFileRoute("/_authenticated/settings/permissions/")({
	component: PermissionsSettingsPage,
});

function PermissionsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "permissions").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <PermissionsSettings visibleItems={visibleItems} />;
}
