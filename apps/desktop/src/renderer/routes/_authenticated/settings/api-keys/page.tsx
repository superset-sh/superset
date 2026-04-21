import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { ApiKeysSettings } from "./components/ApiKeysSettings";

export const Route = createFileRoute("/_authenticated/settings/api-keys/")({
	component: ApiKeysSettingsPage,
});

function ApiKeysSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "apikeys"),
		[searchQuery],
	);

	return <ApiKeysSettings visibleItems={visibleItems} />;
}
