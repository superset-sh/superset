import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";

interface UseV2AgentChoicesResult {
	agents: AgentSelectAgent[];
	isFetched: boolean;
}

const SUPERSET_AGENT: AgentSelectAgent = {
	id: "superset",
	label: "Superset",
	iconId: "superset",
};

// Superset chat isn't in the host's `host_agent_configs` table — it's
// chat-v3's entry point, so it rides the same flag as the rest of chat-v3.
// Append after the host's terminal rows so the user's preferred terminal
// agents stay on top.
export function useAgentChoices(
	hostUrl: string | null,
): UseV2AgentChoicesResult {
	const query = useAgentConfigs(hostUrl);
	const isChatV3Enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHAT_V3) ?? false;
	const agents = useMemo<AgentSelectAgent[]>(() => {
		const terminalAgents: AgentSelectAgent[] = (query.data ?? []).map(
			(config) => ({
				id: config.id,
				label: config.label,
				// Prefer the user's icon override (built-in key or uploaded data
				// URI); fall back to the preset-implied icon.
				iconId: config.iconId ?? config.presetId,
				presetId: config.presetId,
				launchPresetId: resolveAgentLaunchPresetId(
					config.presetId,
					config.command,
				),
			}),
		);
		return isChatV3Enabled
			? [...terminalAgents, SUPERSET_AGENT]
			: terminalAgents;
	}, [query.data, isChatV3Enabled]);

	return { agents, isFetched: query.isFetched };
}
