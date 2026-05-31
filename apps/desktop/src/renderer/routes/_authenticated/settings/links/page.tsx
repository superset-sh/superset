import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { LinksSettings } from "./components/LinksSettings";

export const Route = createFileRoute("/_authenticated/settings/links/")({
	component: LinksSettingsPage,
});

function LinksSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "links",
				searchQuery,
				isV2: true,
			}),
		[searchQuery],
	);

	return <LinksSettings visibleItems={visibleItems} />;
}
