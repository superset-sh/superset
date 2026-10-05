import { createFileRoute, retainSearchParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { validateSettingsHostSearch } from "../hooks/useSettingsHost";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { GitSettings } from "./components/GitSettings";
import { V2GitSettings } from "./components/V2GitSettings";

export const Route = createFileRoute("/_authenticated/settings/git/")({
	component: GitSettingsPage,
	validateSearch: validateSettingsHostSearch,
	search: { middlewares: [retainSearchParams(["hostId"])] },
});

function GitSettingsPage() {
	const searchQuery = useSettingsSearchQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "git",
				searchQuery,
				isV2: isV2CloudEnabled,
			}),
		[searchQuery, isV2CloudEnabled],
	);

	if (isV2CloudEnabled) {
		return <V2GitSettings />;
	}

	return <GitSettings visibleItems={visibleItems} />;
}
