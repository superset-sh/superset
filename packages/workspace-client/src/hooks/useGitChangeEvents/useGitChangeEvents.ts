import { useEffect, useEffectEvent } from "react";
import { type GitChangedPayload, getEventBus } from "../../lib/eventBus";
import { useWorkspaceClient } from "../../providers/WorkspaceClientProvider";

/**
 * Subscribe to `git:changed` events for a specific workspace (or all workspaces with "*").
 * Calls `onChanged` with the workspace ID and event payload whenever git state changes.
 * The payload's `paths` field is present only when the change was worktree-only;
 * absent means a broad state change (HEAD, index, refs, or mixed).
 */
export function useGitChangeEvents(
	workspaceId: string | "*",
	onChanged: (workspaceId: string, payload: GitChangedPayload) => void,
	enabled = true,
): void {
	const { hostUrl, getWsToken } = useWorkspaceClient();
	const handler = useEffectEvent(onChanged);

	useEffect(() => {
		if (!enabled) return;

		const bus = getEventBus(hostUrl, getWsToken);
		return bus.on("git:changed", workspaceId, (id, payload) => {
			handler(id, payload);
		});
	}, [hostUrl, getWsToken, workspaceId, enabled]);
}
