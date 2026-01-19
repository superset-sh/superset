import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { MembersSettings } from "./components/MembersSettings";

export const Route = createFileRoute("/_authenticated/settings/members/")({
	component: MembersSettingsPage,
});

function MembersSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "members").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <MembersSettings visibleItems={visibleItems} />;
}
