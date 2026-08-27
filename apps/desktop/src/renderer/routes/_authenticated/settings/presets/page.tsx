import { createFileRoute, redirect } from "@tanstack/react-router";

type LegacyPresetsSearch = {
	editPresetId?: string;
	presetId?: string;
};

// Legacy URL retained for old links; terminal scripts live in Terminal settings.
export const Route = createFileRoute("/_authenticated/settings/presets/")({
	validateSearch: (search: Record<string, unknown>): LegacyPresetsSearch => ({
		editPresetId:
			typeof search.editPresetId === "string" ? search.editPresetId : undefined,
		presetId: typeof search.presetId === "string" ? search.presetId : undefined,
	}),
	beforeLoad: ({ search }) => {
		throw redirect({
			to: "/settings/terminal",
			search: { editPresetId: search.editPresetId ?? search.presetId },
			replace: true,
		});
	},
});
