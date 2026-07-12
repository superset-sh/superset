import { useMutation } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { ChatTarget } from "../../../../stores/chatTargetStore";
import { useNewChatPreferencesStore } from "../../stores/newChatPreferencesStore";

const FALLBACK_MEDIA_TYPE = "application/octet-stream";

export function useStartWorkspaceChat(
	resolveHostUrl: (hostId: string) => string | null,
) {
	const router = useRouter();
	const modelId = useNewChatPreferencesStore((state) => state.modelId);

	return useMutation({
		mutationFn: async ({
			target,
			message,
		}: {
			target: ChatTarget;
			message: PromptInputMessage;
		}) => {
			const hostUrl = resolveHostUrl(target.hostId);
			if (!hostUrl) throw new Error("Host is not online");
			const client = getHostServiceClientByUrl(hostUrl);
			const attachmentIds = await Promise.all(
				message.attachments.map(async (attachment) => {
					const base64 = await new File(attachment.uri).base64();
					const uploaded = await client.attachments.upload.mutate({
						data: { kind: "base64", data: base64 },
						mediaType: attachment.mediaType ?? FALLBACK_MEDIA_TYPE,
						originalFilename: attachment.name,
					});
					return uploaded.attachmentId;
				}),
			);
			const result = await client.agents.run.mutate({
				workspaceId: target.workspaceId,
				agent: "superset",
				prompt: message.text.trim(),
				model: modelId,
				attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
			});
			return { workspaceId: target.workspaceId, sessionId: result.sessionId };
		},
		onSuccess: ({ workspaceId, sessionId }) => {
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
