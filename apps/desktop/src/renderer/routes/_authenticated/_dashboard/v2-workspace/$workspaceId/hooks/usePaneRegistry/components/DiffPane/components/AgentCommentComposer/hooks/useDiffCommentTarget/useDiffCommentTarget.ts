import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	type AgentTargetStorageKeys,
	type UseAgentTargetResult,
	useAgentTarget,
} from "renderer/hooks/agents/useAgentTarget";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

export type {
	AgentSessionPlacement,
	AgentTarget,
	DecodedAgentSelection as DecodedSelection,
} from "renderer/hooks/agents/useAgentTarget";
export {
	decodeAgentSelection as decodeSelection,
	EXISTING_PREFIX,
	NEW_PREFIX,
} from "renderer/hooks/agents/useAgentTarget";

const COMMENT_STORAGE_KEYS: AgentTargetStorageKeys = {
	configId: "lastSelectedDiffCommentNewAgentConfigId",
	terminalId: "lastSelectedDiffCommentTerminalId",
	placement: "lastSelectedDiffCommentPlacement",
};

interface UseDiffCommentTargetArgs {
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
}

/** DiffPane comment composer's agent target — thin wrapper around the
 *  shared `useAgentTarget` hook with comment-scoped storage keys. */
export function useDiffCommentTarget(
	args: UseDiffCommentTargetArgs,
): UseAgentTargetResult {
	return useAgentTarget({
		...args,
		storageKeys: COMMENT_STORAGE_KEYS,
	});
}
