import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "./store";

/**
 * Hook that listens for agent completion events via tRPC subscription.
 * When an agent completes, updates the tab's needsAttention flag.
 */
export function useAgentHookListener() {
	trpc.notifications.agentComplete.useSubscription(undefined, {
		onData: (event) => {
			useTabsStore.getState().setNeedsAttention(event.tabId, true);
		},
	});
}
