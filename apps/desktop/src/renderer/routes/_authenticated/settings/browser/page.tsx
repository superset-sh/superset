import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { BrowserSettings } from "./components/BrowserSettings";

export const Route = createFileRoute("/_authenticated/settings/browser/")({
	component: BrowserSettingsPage,
});

function BrowserSettingsPage() {
	const searchQuery = useSettingsSearchQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "browser",
				searchQuery,
				isV2: isV2CloudEnabled,
			}),
		[searchQuery, isV2CloudEnabled],
	);

	return <BrowserSettings visibleItems={visibleItems} />;
}
