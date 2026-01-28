import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { RingtonesSettings } from "./components/RingtonesSettings";

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
