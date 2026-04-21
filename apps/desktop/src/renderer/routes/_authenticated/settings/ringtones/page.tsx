import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { RingtonesSettings } from "./components/RingtonesSettings";

export const Route = createFileRoute("/_authenticated/settings/ringtones/")({
	component: RingtonesSettingsPage,
});

function RingtonesSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "ringtones"),
		[searchQuery],
	);

	return <RingtonesSettings visibleItems={visibleItems} />;
}
