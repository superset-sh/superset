import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { AgentSettings } from "./components/AgentSettings";

export const Route = createFileRoute("/_authenticated/settings/agent/")({
	component: AgentSettingsPage,
});

function AgentSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "agent").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <AgentSettings visibleItems={visibleItems} />;
}
