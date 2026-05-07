import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";

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
// routed by id inside `runAgentInWorkspace`. Append after the host's
// terminal rows so the user's preferred terminal agents stay on top.
export function useV2AgentChoices(
	hostUrl: string | null,
): UseV2AgentChoicesResult {
	const query = useV2AgentConfigs(hostUrl);
	const agents = useMemo<AgentSelectAgent[]>(() => {
		const terminalAgents: AgentSelectAgent[] = (query.data ?? []).map(
			(config) => ({
				id: config.id,
				label: config.label,
				iconId: config.presetId,
			}),
		);
		return [...terminalAgents, SUPERSET_AGENT];
	}, [query.data]);

	return { agents, isFetched: query.isFetched };
}
