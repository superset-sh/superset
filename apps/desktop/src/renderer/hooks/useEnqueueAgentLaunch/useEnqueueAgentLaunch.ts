import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { useCallback } from "react";
import {
	type PendingTerminalSetup,
	useWorkspaceInitStore,
} from "renderer/stores/workspace-init";

export interface EnqueueAgentLaunchArgs {
	workspaceId: string;
	projectId: string;
	launchRequest: AgentLaunchRequest | null;
}

/**
 * Shape the pending-setup entry for a V2 launch. Returns null for an
 * empty launch (nothing to stash). Exported for unit testing.
 */
export function buildPendingSetup(
	args: EnqueueAgentLaunchArgs,
): PendingTerminalSetup | null {
	if (!args.launchRequest) return null;
	return {
		workspaceId: args.workspaceId,
		projectId: args.projectId,
		initialCommands: null,
		agentLaunchRequest: {
			...args.launchRequest,
			workspaceId: args.workspaceId,
		},
	};
}

/**
 * V2 hook: stash a pending agent launch for a just-created workspace.
 *
 * When the workspace mounts, V1's terminal-adapter / chat-adapter read
 * the pending setup and execute the launch. This is the same mechanism
 * V1 uses (via useCreateWorkspace.mutateAsyncWithPendingSetup); V2's
 * submit flow calls this directly after host-service.workspaceCreation
 * returns the real workspaceId.
 *
 * Takes a V1-shaped AgentLaunchRequest (produced by
 * buildAgentLaunchRequest in shared/context). Rewrites the request's
 * workspaceId to the real id if it was built with a placeholder.
 */
export function useEnqueueAgentLaunch(): (
	args: EnqueueAgentLaunchArgs,
) => void {
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);

	return useCallback(
		(args) => {
			const setup = buildPendingSetup(args);
			if (setup) addPendingTerminalSetup(setup);
		},
		[addPendingTerminalSetup],
	);
}
