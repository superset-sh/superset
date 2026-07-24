import { toast } from "@superset/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface UseDashboardSidebarAgentKillResult {
	isPending: boolean;
	killAgent: (terminalId: string) => Promise<void>;
	/** Kill several agents at once; resolves with the number actually killed. */
	killAgents: (terminalIds: string[]) => Promise<number>;
}

/**
 * Kill the host terminal session an agent is bound to. Disposing the session
 * ends the agent process; its sidebar chip drops once the bindings query
 * refreshes (the `agent:lifecycle` event invalidates it too, but we invalidate
 * eagerly so the chip disappears without waiting on the event).
 */
export function useDashboardSidebarAgentKill(
	workspaceId: string,
): UseDashboardSidebarAgentKillResult {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const queryClient = useQueryClient();
	const [isPending, setIsPending] = useState(false);

	const killAgent = useCallback(
		async (terminalId: string): Promise<void> => {
			if (!hostUrl) {
				toast.error("Failed to kill agent", {
					description: "No host is available for this workspace",
				});
				return;
			}
			setIsPending(true);
			try {
				await getHostServiceClientByUrl(hostUrl).terminal.killSession.mutate({
					terminalId,
					workspaceId,
				});
			} catch (error) {
				console.error("[sidebar-agent] Failed to kill agent:", error);
				toast.error("Failed to kill agent");
			} finally {
				void queryClient.invalidateQueries({
					queryKey: ["terminal-agent-bindings", hostUrl, workspaceId],
				});
				setIsPending(false);
			}
		},
		[hostUrl, workspaceId, queryClient],
	);

	const killAgents = useCallback(
		async (terminalIds: string[]): Promise<number> => {
			if (terminalIds.length === 0) return 0;
			if (!hostUrl) {
				toast.error("Failed to stop agents", {
					description: "No host is available for this workspace",
				});
				return 0;
			}
			setIsPending(true);
			try {
				const results = await Promise.allSettled(
					terminalIds.map((terminalId) =>
						getHostServiceClientByUrl(hostUrl).terminal.killSession.mutate({
							terminalId,
							workspaceId,
						}),
					),
				);
				const failedCount = results.filter(
					(result) => result.status === "rejected",
				).length;
				if (failedCount > 0) {
					toast.error(
						failedCount === 1
							? "Failed to stop 1 agent"
							: `Failed to stop ${failedCount} agents`,
					);
				}
				return results.length - failedCount;
			} finally {
				void queryClient.invalidateQueries({
					queryKey: ["terminal-agent-bindings", hostUrl, workspaceId],
				});
				setIsPending(false);
			}
		},
		[hostUrl, workspaceId, queryClient],
	);

	return { isPending, killAgent, killAgents };
}
