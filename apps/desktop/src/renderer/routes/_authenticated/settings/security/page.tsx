import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { SecuritySettings } from "./components/SecuritySettings";

export const Route = createFileRoute("/_authenticated/settings/security/")({
	component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "security").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <SecuritySettings visibleItems={visibleItems} />;
}
