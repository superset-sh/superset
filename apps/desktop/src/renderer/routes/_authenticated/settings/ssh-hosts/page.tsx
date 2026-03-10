import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { SshHostsSettings } from "./components/SshHostsSettings";

export const Route = createFileRoute("/_authenticated/settings/ssh-hosts/")({
	component: SshHostsSettingsPage,
});

function SshHostsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "ssh-hosts").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <SshHostsSettings visibleItems={visibleItems} />;
}
