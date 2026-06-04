import {
	getEnabledAgentConfigs,
	type ResolvedAgentConfig,
} from "@superset/shared/agent-settings";
import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface UseEnabledAgentsResult {
	agents: ResolvedAgentConfig[];
	isPending: boolean;
	isFetched: boolean;
}

/** Fetches agent presets from the desktop settings IPC and returns only the
 * enabled ones. Shared across the automations and new-workspace flows. */
export function useEnabledAgents(): UseEnabledAgentsResult {
	const query = electronTrpc.settings.getAgentPresets.useQuery();

	const agents = useMemo(
		() => getEnabledAgentConfigs(query.data ?? []),
		[query.data],
	);

	return { agents, isPending: query.isPending, isFetched: query.isFetched };
}
