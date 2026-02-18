import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { SshConnectionsSettings } from "./components/SshConnectionsSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/ssh-connections/",
)({
	component: SshConnectionsSettingsPage,
});

function SshConnectionsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "ssh-connections").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <SshConnectionsSettings visibleItems={visibleItems} />;
}
