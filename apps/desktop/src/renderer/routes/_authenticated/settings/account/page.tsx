import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AccountSettings } from "./components/AccountSettings";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export const Route = createFileRoute("/_authenticated/settings/account/")({
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "account").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return <AccountSettings visibleItems={visibleItems} />;
}
