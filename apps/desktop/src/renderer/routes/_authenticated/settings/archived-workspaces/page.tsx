import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ArchivedWorkspacesSettings } from "./components/ArchivedWorkspacesSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/archived-workspaces/",
)({
	component: ArchivedWorkspacesSettingsPage,
});

function ArchivedWorkspacesSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "archivedWorkspaces").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <ArchivedWorkspacesSettings visibleItems={visibleItems} />;
}
