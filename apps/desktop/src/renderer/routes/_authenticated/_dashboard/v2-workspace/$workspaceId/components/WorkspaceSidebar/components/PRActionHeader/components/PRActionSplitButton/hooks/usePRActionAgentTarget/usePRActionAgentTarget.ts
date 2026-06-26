import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	type AgentTargetStorageKeys,
	type UseAgentTargetResult,
	useAgentTarget,
} from "renderer/hooks/agents/useAgentTarget";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

const PR_ACTION_STORAGE_KEYS: AgentTargetStorageKeys = {
	configId: "lastSelectedPRActionNewAgentConfigId",
	terminalId: "lastSelectedPRActionTerminalId",
	placement: "lastSelectedPRActionPlacement",
};

interface UsePRActionAgentTargetArgs {
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
}

/** PR action button's agent target — thin wrapper around the shared
 *  `useAgentTarget` hook with PR-action-scoped storage keys, so picks here
 *  don't trample the DiffPane comment composer's last-picked agent. */
export function usePRActionAgentTarget(
	args: UsePRActionAgentTargetArgs,
): UseAgentTargetResult {
	return useAgentTarget({
		...args,
		storageKeys: PR_ACTION_STORAGE_KEYS,
	});
}
