import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { track } from "@/lib/posthog";
import { getHostTerminalsQueryKey } from "../../../../hooks/useHostTerminals";
import type { ChatTarget } from "../../../../stores/chatTargetStore";

/**
 * Launch a NEW agent session in an existing workspace (`agents.run` bakes the
 * prompt into the launch command) and land on its tab. Always a fresh session
 * — the composer says "New agent in …", and delivering into an already-running
 * session belongs to explicit flows like the terminal composer or the
 * finish-review target picker, never to this one.
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
			target: ChatTarget;
			message: PromptInputMessage;
			agentId: string;
		}) => {
			// Mirrors desktop's agent-session-orchestrator payload so the same
			// funnel splits by surface rather than needing its own.
			const startedAt = Date.now();
			const launch = {
				launch_source: "mobile_composer",
				request_kind: "workspace_session",
				agent_type: agentId,
				workspace_id: target.workspaceId,
			};
			const fail = (reason: string): Error => {
				track("agent_session_launch", {
					...launch,
					result: "failed",
					latency_ms: Date.now() - startedAt,
					failure_reason: reason,
				});
				return new Error(reason);
			};

			const workspace = workspaces.find(
				(item) => item.id === target.workspaceId,
			);
			if (!workspace) throw fail("Workspace is not available");
			if (message.attachments.length > 0) {
				throw fail("Attachments are not supported in terminal sessions yet");
			}
			const hostUrl = hostServiceUrl(workspace.organizationId, target.hostId);
			const client = getHostServiceClientByUrl(hostUrl);
			const text = message.text.trim();

			const result = await client.agents.run
				.mutate({
					workspaceId: target.workspaceId,
					agent: agentId,
					prompt: text,
				})
				.catch((cause: unknown) => {
					throw fail(cause instanceof Error ? cause.message : String(cause));
				});
			if (result.kind !== "terminal") {
				throw fail(`${result.label} did not start a terminal session`);
			}
			track("agent_session_launch", {
				...launch,
				result: "launched",
				latency_ms: Date.now() - startedAt,
				failure_reason: null,
			});
			return {
				workspaceId: target.workspaceId,
				terminalId: result.sessionId,
				hostId: target.hostId,
			};
		},
		onSuccess: ({ workspaceId, terminalId, hostId }) => {
			void queryClient.invalidateQueries({
				queryKey: getHostTerminalsQueryKey(hostId),
			});
			router.push(
				`/(authenticated)/workspace/${workspaceId}?tab=${terminalId}`,
			);
		},
		onError: (error) => {
			Alert.alert(
				"Could not start agent",
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
