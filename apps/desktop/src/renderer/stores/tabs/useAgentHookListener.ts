import { useEffect } from "react";
import { useTabsStore } from "./store";

/**
 * Hook that listens for agent completion events from the main process.
 * When Claude's Stop hook fires, it sends an HTTP request to the hooks server,
 * which then sends an IPC event to the renderer with the tabId.
 * This hook updates the tab's needsAttention flag.
 */
export function useAgentHookListener() {
	useEffect(() => {
		const handleAgentComplete = ({ tabId }: { tabId: string }) => {
			useTabsStore.getState().setNeedsAttention(tabId, true);
		};

		const handleAgentDismiss = ({ tabId }: { tabId: string }) => {
			useTabsStore.getState().setNeedsAttention(tabId, false);
		};

		window.ipcRenderer.on("agent-hook:complete", handleAgentComplete);
		window.ipcRenderer.on("agent-hook:dismiss", handleAgentDismiss);

		return () => {
			window.ipcRenderer.off("agent-hook:complete", handleAgentComplete);
			window.ipcRenderer.off("agent-hook:dismiss", handleAgentDismiss);
		};
	}, []);
}
