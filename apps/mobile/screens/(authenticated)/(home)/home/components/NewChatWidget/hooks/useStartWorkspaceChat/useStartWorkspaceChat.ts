import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { createAcpSession, createAcpSessionsApi } from "@/lib/host/client";
import type { ChatTarget } from "../../../../stores/chatTargetStore";

export function useStartWorkspaceChat(workspaces: HostWorkspaceItem[]) {
	const router = useRouter();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			target,
			message,
		}: {
			target: ChatTarget;
			message: PromptInputMessage;
		}) => {
			const workspace = workspaces.find(
				(item) => item.id === target.workspaceId,
			);
			if (!workspace) throw new Error("Workspace is not available");
			if (message.attachments.length > 0) {
				throw new Error("Attachments are not supported in live sessions yet");
			}
			const routingKey = buildHostRoutingKey(
				workspace.organizationId,
				target.hostId,
			);
			const sessionId = Crypto.randomUUID();
			await createAcpSession(routingKey, {
				sessionId,
				workspaceId: target.workspaceId,
			});
			await createAcpSessionsApi(routingKey).prompt({
				sessionId,
				prompt: [{ type: "text", text: message.text.trim() }],
			});
			return { workspaceId: target.workspaceId, sessionId };
		},
		onSuccess: ({ workspaceId, sessionId }) => {
			void queryClient.invalidateQueries({
				queryKey: ["acp-sessions", "list"],
			});
			router.push(
				`/(authenticated)/workspace/${workspaceId}/chat/acp/${sessionId}`,
			);
		},
		onError: (error) => {
			Alert.alert(
				"Could not start chat",
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
