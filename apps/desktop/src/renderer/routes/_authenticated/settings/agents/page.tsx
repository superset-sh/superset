import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { AgentsSettings } from "./components/AgentsSettings";

export const Route = createFileRoute("/_authenticated/settings/agents/")({
	component: AgentsSettingsPage,
});

function AgentsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "agents").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <AgentsSettings visibleItems={visibleItems} />;
}
