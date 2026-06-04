import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { AgentsSettings } from "./components/AgentsSettings";

export type AgentsSettingsSearch = {
	/**
	 * Builtin agent preset id (e.g. "claude", "codex"). When set, the v2
	 * agents page selects the matching host config on mount. v1 ignores it.
	 */
	agent?: string;
};

export const Route = createFileRoute("/_authenticated/settings/agents/")({
	component: AgentsSettingsPage,
	validateSearch: (search: Record<string, unknown>): AgentsSettingsSearch => ({
		agent: typeof search.agent === "string" ? search.agent : undefined,
	}),
});

function AgentsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();
	const { agent } = Route.useSearch();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "agents").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return (
		<AgentsSettings
			visibleItems={visibleItems}
			initialAgentPresetId={agent ?? null}
		/>
	);
}
