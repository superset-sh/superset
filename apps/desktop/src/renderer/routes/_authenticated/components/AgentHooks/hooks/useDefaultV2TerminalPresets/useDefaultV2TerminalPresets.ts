import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import {
	DEFAULT_V2_USER_PREFERENCES,
	V2_USER_PREFERENCES_ID,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useCollections } from "../../../../providers/CollectionsProvider";
import { createDefaultV2TerminalPresetRows } from "./default-v2-terminal-presets";

export function useDefaultV2TerminalPresets(hostUrl: string | null): void {
	const collections = useCollections();
	const { data: agents = [], isFetched: agentsFetched } =
		useV2AgentConfigs(hostUrl);

	const { data: v2Presets = [], isReady: presetsReady } = useLiveQuery(
		(query) => query.from({ presets: collections.v2TerminalPresets }),
		[collections],
	);
	const { data: preferenceRows = [], isReady: preferencesReady } = useLiveQuery(
		(query) =>
			query
				.from({ prefs: collections.v2UserPreferences })
				.where(({ prefs }) => eq(prefs.id, V2_USER_PREFERENCES_ID)),
		[collections],
	);

	const preferences = preferenceRows[0] ?? DEFAULT_V2_USER_PREFERENCES;

	useEffect(() => {
		if (
			!hostUrl ||
			!agentsFetched ||
			!presetsReady ||
			!preferencesReady ||
			preferences.terminalPresetsInitialized
		) {
			return;
		}

		const createdAt = new Date();
		const rows = createDefaultV2TerminalPresetRows({
			agents,
			existingPresets: v2Presets,
			createId: () => crypto.randomUUID(),
			createdAt,
		});

		for (const row of rows) {
			collections.v2TerminalPresets.insert(row);
		}

		// If both are empty, agents weren't available yet — retry next launch.
		if (rows.length === 0 && v2Presets.length === 0) return;

		const existingPreferences = collections.v2UserPreferences.get(
			V2_USER_PREFERENCES_ID,
		);
		if (!existingPreferences) {
			collections.v2UserPreferences.insert({
				...DEFAULT_V2_USER_PREFERENCES,
				terminalPresetsInitialized: true,
			});
			return;
		}

		collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
			draft.terminalPresetsInitialized = true;
		});
	}, [
		agents,
		agentsFetched,
		collections.v2TerminalPresets,
		collections.v2UserPreferences,
		hostUrl,
		preferences.terminalPresetsInitialized,
		preferencesReady,
		presetsReady,
		v2Presets,
	]);
}
