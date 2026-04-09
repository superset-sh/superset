import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	DEFAULT_TERMINAL_PRESET_AGENT_TYPES,
} from "@superset/shared/agent-command";
import { useEffect, useRef } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const SEED_MARKER_KEY = "v2-terminal-presets-seeded";

/**
 * Seeds default terminal presets into the v2TerminalPresets collection once
 * per browser profile. Uses localStorage as a marker so we don't reseed after
 * the user has intentionally deleted a default preset.
 */
export function useSeedDefaultV2Presets() {
	const collections = useCollections();
	const seededRef = useRef(false);

	useEffect(() => {
		if (seededRef.current) return;
		if (localStorage.getItem(SEED_MARKER_KEY) === "1") {
			seededRef.current = true;
			return;
		}

		for (const [
			index,
			agent,
		] of DEFAULT_TERMINAL_PRESET_AGENT_TYPES.entries()) {
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: agent,
				description: AGENT_PRESET_DESCRIPTIONS[agent],
				cwd: "",
				commands: AGENT_PRESET_COMMANDS[agent],
				projectIds: null,
				pinnedToBar: true,
				executionMode: "new-tab",
				tabOrder: index,
				createdAt: new Date(),
			});
		}

		localStorage.setItem(SEED_MARKER_KEY, "1");
		seededRef.current = true;
	}, [collections.v2TerminalPresets]);
}
