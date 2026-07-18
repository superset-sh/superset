import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { createSession, submitTurn } from "@/lib/host/client";
import { resolveChatModelId } from "@/screens/(authenticated)/(home)/utils/chatModels";
import type { ChatTarget } from "../../../../stores/chatTargetStore";

export function useStartWorkspaceChat(workspaces: HostWorkspaceItem[]) {
	const router = useRouter();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			target,
			modelId,
			message,
		}: {
			target: ChatTarget;
			/** Chat-model alias; omitted (file-comment flows) = harness default. */
			modelId?: string;
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
			// The host mints the session id (sessions.create result carries it).
			const created = await createSession(routingKey, {
				workspaceId: target.workspaceId,
				activeModel: modelId ? resolveChatModelId(modelId) : null,
			});
			await submitTurn(routingKey, {
				sessionId: created.session.id,
				threadId: created.session.mainThreadId,
				content: [{ type: "text", text: message.text.trim() }],
			});
			return { workspaceId: target.workspaceId, sessionId: created.session.id };
		},
		onSuccess: ({ workspaceId, sessionId }) => {
			void queryClient.invalidateQueries({
				queryKey: ["sessions", "list"],
			});
			router.push(
				`/(authenticated)/workspace/${workspaceId}/chat/${sessionId}`,
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
