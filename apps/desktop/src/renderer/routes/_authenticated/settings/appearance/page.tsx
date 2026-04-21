import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { AppearanceSettings } from "./components/AppearanceSettings";

export const Route = createFileRoute("/_authenticated/settings/appearance/")({
	component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "appearance"),
		[searchQuery],
	);

	return <AppearanceSettings visibleItems={visibleItems} />;
}
