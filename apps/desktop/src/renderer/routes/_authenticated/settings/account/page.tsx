import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { AccountSettings } from "./components/AccountSettings";

export const Route = createFileRoute("/_authenticated/settings/account/")({
	component: AccountSettingsPage,
});

function AccountSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "account"),
		[searchQuery],
	);

	return <AccountSettings visibleItems={visibleItems} />;
}
