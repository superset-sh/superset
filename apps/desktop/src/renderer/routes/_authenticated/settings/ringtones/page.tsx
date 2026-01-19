import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { RingtonesSettings } from "renderer/screens/main/components/SettingsView/RingtonesSettings";
import { getMatchingItemsForSection } from "renderer/screens/main/components/SettingsView/settings-search";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export const Route = createFileRoute("/_authenticated/settings/ringtones/")({
	component: RingtonesSettingsPage,
});

function RingtonesSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "ringtones").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <RingtonesSettings visibleItems={visibleItems} />;
}
