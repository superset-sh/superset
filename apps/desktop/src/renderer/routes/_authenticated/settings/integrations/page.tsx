import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { IntegrationsSettings } from "./components/IntegrationsSettings";

export const Route = createFileRoute("/_authenticated/settings/integrations/")({
	component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "integrations"),
		[searchQuery],
	);

	return <IntegrationsSettings visibleItems={visibleItems} />;
}
