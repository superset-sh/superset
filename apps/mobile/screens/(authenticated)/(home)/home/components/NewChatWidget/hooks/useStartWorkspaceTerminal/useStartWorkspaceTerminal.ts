import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { posthog } from "@/lib/posthog";
import { getHostTerminalsQueryKey } from "../../../../hooks/useHostTerminals";

export interface WorkspaceTerminalTarget {
	workspaceId: string;
	hostId: string;
}

/**
 * Launch a NEW agent session in an existing workspace (`agents.run` bakes the
 * prompt into the launch command) and land on its tab. Always a fresh session
 * — delivering into an already-running session belongs to explicit flows like
 * the terminal composer or the finish-review target picker, never to this one.
 */
export function useStartWorkspaceTerminal(workspaces: HostWorkspaceItem[]) {
	const router = useRouter();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			target,
			message,
			agentId,
		}: {
			target: WorkspaceTerminalTarget;
			message: PromptInputMessage;
			agentId: string;
		}) => {
			const workspace = workspaces.find(
				(item) => item.id === target.workspaceId,
			);
			if (!workspace) throw new Error("Workspace is not available");
			if (message.attachments.length > 0) {
				throw new Error(
					"Attachments are not supported in terminal sessions yet",
				);
			}
			const hostUrl = hostServiceUrl(workspace.organizationId, target.hostId);
			const client = getHostServiceClientByUrl(hostUrl);
			const text = message.text.trim();

			const result = await client.agents.run.mutate({
				workspaceId: target.workspaceId,
				agent: agentId,
				prompt: text,
			});
			if (result.kind !== "terminal") {
				throw new Error(`${result.label} did not start a terminal session`);
			}
			return {
				workspaceId: target.workspaceId,
				terminalId: result.sessionId,
				hostId: target.hostId,
			};
		},
		onSuccess: ({ workspaceId, terminalId, hostId }, { agentId }) => {
			posthog.capture("agent_session_launch", {
				agent_type: agentId,
				workspace_id: workspaceId,
				result: "launched",
			});
			void queryClient.invalidateQueries({
				queryKey: getHostTerminalsQueryKey(hostId),
			});
			router.push(
				`/(authenticated)/workspace/${workspaceId}?tab=${terminalId}`,
			);
		},
		onError: (error, { target, agentId }) => {
			posthog.capture("agent_session_launch", {
				agent_type: agentId,
				workspace_id: target.workspaceId,
				result: "failed",
			});
			Alert.alert(
				i18n._(
					msg({
						message: "Could not start agent",
					}),
				),
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
