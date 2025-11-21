import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces/useSetActiveWorkspace";
import { useTabsStore } from "./store";

/**
 * Hook that listens for notification events via tRPC subscription.
 * Handles agent completions and focus requests from native notifications.
 */
export function useAgentHookListener() {
	const setActiveWorkspace = useSetActiveWorkspace();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	trpc.notifications.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "agent-complete") {
				const { tabId, workspaceId } = event.data;
				const state = useTabsStore.getState();

				// Only show red dot if not already viewing this tab
				const isAlreadyActive =
					activeWorkspace?.id === workspaceId &&
					state.activeTabIds[workspaceId] === tabId;

				if (!isAlreadyActive) {
					state.setNeedsAttention(tabId, true);
				}
			} else if (event.type === "focus-tab") {
				const { tabId, workspaceId } = event.data;
				// Switch to the workspace first (with proper invalidation), then set active tab
				setActiveWorkspace.mutate(
					{ id: workspaceId },
					{
						onSuccess: () => {
							useTabsStore.getState().setActiveTab(workspaceId, tabId);
						},
					},
				);
			}
		},
	});
}
