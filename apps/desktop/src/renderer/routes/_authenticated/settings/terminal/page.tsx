import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { TerminalSettings } from "./components/TerminalSettings";

export type TerminalSettingsSearch = {
	editPresetId?: string;
	createProjectId?: string;
};

export const Route = createFileRoute("/_authenticated/settings/terminal/")({
	component: TerminalSettingsPage,
	validateSearch: (
		search: Record<string, unknown>,
	): TerminalSettingsSearch => ({
		editPresetId:
			typeof search.editPresetId === "string" ? search.editPresetId : undefined,
		createProjectId:
			typeof search.createProjectId === "string"
				? search.createProjectId
				: undefined,
	}),
});

function TerminalSettingsPage() {
	const navigate = Route.useNavigate();
	const { editPresetId, createProjectId } = Route.useSearch();
	const searchQuery = useSettingsSearchQuery();
	const { isV2CloudEnabled } = useIsV2CloudEnabled();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "terminal",
				searchQuery,
				isV2: isV2CloudEnabled,
			}),
		[searchQuery, isV2CloudEnabled],
	);

	return (
		<TerminalSettings
			visibleItems={visibleItems}
			editingPresetId={editPresetId ?? null}
			pendingCreateProjectId={createProjectId ?? null}
			onEditingPresetIdChange={(presetId) => {
				navigate({
					search: {
						editPresetId: presetId ?? undefined,
						createProjectId: createProjectId ?? undefined,
					},
					replace: true,
				});
			}}
			onPendingCreateProjectIdChange={(projectId) => {
				navigate({
					search: {
						editPresetId: editPresetId ?? undefined,
						createProjectId: projectId ?? undefined,
					},
					replace: true,
				});
			}}
		/>
	);
}
