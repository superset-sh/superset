import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { getMatchingItemsForSection } from "renderer/screens/main/components/SettingsView/settings-search";
import { TerminalSettings } from "renderer/screens/main/components/SettingsView/TerminalSettings";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export const Route = createFileRoute("/_authenticated/settings/terminal/")({
	component: TerminalSettingsPage,
});

function TerminalSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "terminal").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <TerminalSettings visibleItems={visibleItems} />;
}
