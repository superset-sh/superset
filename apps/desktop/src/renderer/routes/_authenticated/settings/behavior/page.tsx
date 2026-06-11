import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import {
	VOICE_INPUT_HOTKEY_ID,
	VOICE_SHORTCUT_SECTION_ID,
} from "../utils/voice-shortcut-links";
import { BehaviorSettings } from "./components/BehaviorSettings";

type BehaviorSettingsSearch = {
	section?: string;
};

export const Route = createFileRoute("/_authenticated/settings/behavior/")({
	component: BehaviorSettingsPage,
	validateSearch: (
		search: Record<string, unknown>,
	): BehaviorSettingsSearch => ({
		section: typeof search.section === "string" ? search.section : undefined,
	}),
});

function BehaviorSettingsPage() {
	const navigate = Route.useNavigate();
	const { section } = Route.useSearch();
	const searchQuery = useSettingsSearchQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "behavior",
				searchQuery,
				isV2: isV2CloudEnabled,
			}),
		[searchQuery, isV2CloudEnabled],
	);

	return (
		<BehaviorSettings
			focusedSection={section ?? null}
			onVoiceShortcutNavigate={() => {
				navigate({
					to: "/settings/keyboard",
					search: {
						section: VOICE_SHORTCUT_SECTION_ID,
						shortcut: VOICE_INPUT_HOTKEY_ID,
					},
				});
			}}
			visibleItems={visibleItems}
		/>
	);
}
