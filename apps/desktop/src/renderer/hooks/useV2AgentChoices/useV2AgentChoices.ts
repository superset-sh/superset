import {
	BUILTIN_AGENT_DEFINITIONS,
	isChatAgentDefinition,
} from "@superset/shared/agent-catalog";
import { useMemo } from "react";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";

interface UseV2AgentChoicesResult {
	agents: AgentSelectAgent[];
	isFetched: boolean;
}

// Built-in chat agents aren't in the host's `host_agent_configs` table —
// they're routed by id inside `runAgentInWorkspace`. Append after the
// host's terminal rows so the user's preferred terminal agents stay on
// top of the picker.
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
		const chatAgents: AgentSelectAgent[] = BUILTIN_AGENT_DEFINITIONS.filter(
			isChatAgentDefinition,
		).map((definition) => ({
			id: definition.id,
			label: definition.label,
			iconId: definition.id,
		}));
		return [...terminalAgents, ...chatAgents];
	}, [query.data]);

	return { agents, isFetched: query.isFetched };
}
