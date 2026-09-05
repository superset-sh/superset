import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { LinksSettings } from "./components/LinksSettings";

export type LinksSettingsSearch = {
	/** Deep link from the "Open in" menus: open the Add app dialog on arrival. */
	addApp?: boolean;
};

export const Route = createFileRoute("/_authenticated/settings/links/")({
	component: LinksSettingsPage,
	validateSearch: (search: Record<string, unknown>): LinksSettingsSearch => ({
		addApp: search.addApp === true || search.addApp === "true" || undefined,
	}),
});

function LinksSettingsPage() {
	const navigate = Route.useNavigate();
	const { addApp } = Route.useSearch();
	const searchQuery = useSettingsSearchQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "links",
				searchQuery,
				isV2: isV2CloudEnabled,
			}),
		[searchQuery, isV2CloudEnabled],
	);

	// One-shot: once the dialog has opened, drop the param so a reload or
	// Back doesn't reopen it.
	const handleAddAppHandled = useCallback(() => {
		navigate({ search: {}, replace: true });
	}, [navigate]);

	return (
		<LinksSettings
			visibleItems={visibleItems}
			openAddApp={addApp === true}
			onAddAppHandled={handleAddAppHandled}
		/>
	);
}
