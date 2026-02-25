import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { TerminalSettings } from "./components/TerminalSettings";

export type TerminalSettingsSearch = {
	editPresetId?: string;
};

export const Route = createFileRoute("/_authenticated/settings/terminal/")({
	component: TerminalSettingsPage,
	validateSearch: (
		search: Record<string, unknown>,
	): TerminalSettingsSearch => ({
		editPresetId:
			typeof search.editPresetId === "string" ? search.editPresetId : undefined,
	}),
});

function TerminalSettingsPage() {
	const navigate = Route.useNavigate();
	const { editPresetId } = Route.useSearch();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "terminal").map(
			(item) => item.id,
		);
	}, [searchQuery]);

	return (
		<TerminalSettings
			visibleItems={visibleItems}
			editingPresetId={editPresetId ?? null}
			onEditingPresetIdChange={(presetId) => {
				navigate({
					search: {
						editPresetId: presetId ?? undefined,
					},
					replace: true,
				});
			}}
		/>
	);
}
