import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { IntegrationsSettings } from "./components/IntegrationsSettings";

export const Route = createFileRoute("/_authenticated/settings/integrations/")({
	component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "integrations").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <IntegrationsSettings visibleItems={visibleItems} />;
}
