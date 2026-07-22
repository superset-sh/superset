import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../../../utils/settings-search";
import { AgentsSettings } from "../AgentsSettings";

interface AgentsSettingsPageProps {
	initialAgentId?: string | null;
}

export function AgentsSettingsPage({
	initialAgentId = null,
}: AgentsSettingsPageProps) {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "agents").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return (
		<AgentsSettings
			visibleItems={visibleItems}
			initialAgentId={initialAgentId}
		/>
	);
}
