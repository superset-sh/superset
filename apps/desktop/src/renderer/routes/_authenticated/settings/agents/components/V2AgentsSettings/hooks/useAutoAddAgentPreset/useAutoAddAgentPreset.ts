import type { HostAgentConfig } from "@superset/host-service/settings";
import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { getAgentCommandText } from "renderer/lib/agent-launch-command";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const DESCRIPTION_BY_PRESET_ID = new Map<string, string>(
	HOST_AGENT_PRESETS.map((preset) => [preset.presetId, preset.description]),
);

/** Auto-creates a linked terminal preset for a newly added agent config
 * (same row shape as the Settings → Terminal "Import agent" flow). */
export function useAutoAddAgentPreset(): (agent: HostAgentConfig) => void {
	const collections = useCollections();
	const { data: presets = [] } = useLiveQuery(
		(query) => query.from({ presets: collections.v2TerminalPresets }),
		[collections],
	);

	return useCallback(
		(agent: HostAgentConfig) => {
			if (agent.command.trim().length === 0) return;
			if (presets.some((preset) => preset.agentId === agent.id)) return;
			const maxTabOrder = presets.reduce(
				(max, preset) => Math.max(max, preset.tabOrder),
				-1,
			);
			collections.v2TerminalPresets.insert({
				id: crypto.randomUUID(),
				name: agent.label,
				description: DESCRIPTION_BY_PRESET_ID.get(agent.presetId),
				cwd: "",
				commands: [getAgentCommandText(agent)],
				projectIds: null,
				executionMode: "new-tab",
				tabOrder: maxTabOrder + 1,
				createdAt: new Date(),
				agentId: agent.id,
			});
		},
		[collections, presets],
	);
}
