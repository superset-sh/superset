import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { AgentsSettings } from "./components/AgentsSettings";

export const Route = createFileRoute("/_authenticated/settings/agents/")({
	component: AgentsSettingsPage,
});

function AgentsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "agents"),
		[searchQuery],
	);

	return <AgentsSettings visibleItems={visibleItems} />;
}
