import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { GitSettings } from "./components/GitSettings";
import { V2GitSettings } from "./components/V2GitSettings";

export const Route = createFileRoute("/_authenticated/settings/git/")({
	component: GitSettingsPage,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function GitSettingsPage() {
	const searchQuery = useSettingsSearchQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { hostId } = Route.useSearch();

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
		return <V2GitSettings hostId={hostId ?? null} />;
	}

	return <GitSettings visibleItems={visibleItems} />;
}
