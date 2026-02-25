import { createFileRoute, Navigate } from "@tanstack/react-router";

type LegacyPresetsSearch = {
	editPresetId?: string;
	presetId?: string;
};

export const Route = createFileRoute("/_authenticated/settings/presets/")({
	component: PresetsRedirect,
	validateSearch: (search: Record<string, unknown>): LegacyPresetsSearch => ({
		editPresetId:
			typeof search.editPresetId === "string" ? search.editPresetId : undefined,
		presetId: typeof search.presetId === "string" ? search.presetId : undefined,
	}),
});

// Presets have been merged into Terminal settings
function PresetsRedirect() {
	const { editPresetId, presetId } = Route.useSearch();
	return (
		<Navigate
			to="/settings/terminal"
			search={{
				editPresetId: editPresetId ?? presetId,
			}}
			replace
		/>
	);
}
