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
		const removeListener = bus.on("git:changed", workspaceId, (id, payload) => {
			handler(id, payload);
		});
		// GitWatcher only watches a workspace while someone holds interest
		// (#6729). A specific workspaceId can request that directly; "*"
		// (listen across every workspace) has no equivalent — watching every
		// workspace to serve one wildcard subscriber would reintroduce the
		// exact always-on registration this refcounting replaced, so a "*"
		// caller only receives events for workspaces something else is
		// already watching.
		if (workspaceId === "*") return removeListener;
		bus.watchGit(workspaceId);
		return () => {
			removeListener();
			bus.unwatchGit(workspaceId);
		};
	}, [hostUrl, getWsToken, workspaceId, enabled]);
}
