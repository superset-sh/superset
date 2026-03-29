import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { OrganizationSettings } from "./components/OrganizationSettings";

export const Route = createFileRoute("/_authenticated/settings/organization/")({
	component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "organization"),
		[searchQuery],
	);

	return <OrganizationSettings visibleItems={visibleItems} />;
}
