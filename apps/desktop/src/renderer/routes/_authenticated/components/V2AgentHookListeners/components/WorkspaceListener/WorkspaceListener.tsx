import { useV2AgentHookListener } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2AgentHookListener";

/**
 * Invisible helper: subscribes a single workspace to agent-lifecycle
 * events. Parent `V2AgentHookListeners` renders one of these per open
 * v2 workspace so backgrounded workspaces still receive hook events.
 */
export function WorkspaceListener({
	workspaceId,
}: {
	workspaceId: string;
}): null {
	useV2AgentHookListener(workspaceId);
	return null;
}
