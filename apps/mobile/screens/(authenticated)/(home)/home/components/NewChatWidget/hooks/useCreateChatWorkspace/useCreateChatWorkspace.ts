import type { ContentBlock } from "@superset/host-service-sync/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { createSession, submitTurn } from "@/lib/host/client";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { resolveChatModelId } from "@/screens/(authenticated)/(home)/utils/chatModels";
import type { NewChatTarget } from "../useNewChatTargets";

interface CreateChatWorkspaceArgs {
	target: NewChatTarget;
	baseBranch: string | null;
	modelId: string;
	message: PromptInputMessage;
}

/**
 * Creates a workspace on the target host, then starts a canonical
 * `sessions.*` chat in it (sessions.create + submitTurn — the same plane
 * `useStartWorkspaceChat` uses for existing workspaces) and navigates to the
 * live thread. Image attachments ride the first turn as canonical image
 * blocks; there is no host-side upload on this plane.
 */
export function useCreateChatWorkspace() {
	const router = useRouter();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			target,
			baseBranch,
			modelId,
			message,
		}: CreateChatWorkspaceArgs) => {
			const content = await buildTurnContent(message);

			const client = getHostServiceClientByUrl(target.hostUrl);
			const created = await client.workspaces.create.mutate({
				id: randomUUID(),
				projectId: target.projectId,
				baseBranch: baseBranch ?? undefined,
			});
			const workspaceId = created.workspace.id;

			const session = await createSession(target.routingKey, {
				workspaceId,
				activeModel: resolveChatModelId(modelId),
			});
			await submitTurn(target.routingKey, {
				sessionId: session.session.id,
				threadId: session.session.mainThreadId,
				content,
			});
			return { workspaceId, sessionId: session.session.id };
		},
		onSuccess: ({ workspaceId, sessionId }) => {
			void queryClient.invalidateQueries({
				queryKey: ["host-service", "workspaces", "list"],
			});
			void queryClient.invalidateQueries({ queryKey: ["sessions", "list"] });
			router.push(
				`/(authenticated)/workspace/${workspaceId}/chat/${sessionId}`,
			);
		},
		onError: (error) => {
			Alert.alert(
				"Could not create workspace",
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}

/**
 * First-turn content: the prompt text plus any image attachments as base64
 * image blocks. Rejecting non-images up front (before the workspace is
 * created) keeps a doomed submit from leaving an empty workspace behind.
 */
async function buildTurnContent(
	message: PromptInputMessage,
): Promise<ContentBlock[]> {
	const content: ContentBlock[] = [];
	const text = message.text.trim();
	if (text.length > 0) content.push({ type: "text", text });
	for (const attachment of message.attachments) {
		const mimeType = attachment.mediaType;
		if (!mimeType?.startsWith("image/")) {
			throw new Error(
				"Only image attachments are supported in live sessions yet",
			);
		}
		const data = await new File(attachment.uri).base64();
		content.push({ type: "image", mimeType, data });
	}
	if (content.length === 0) {
		throw new Error("Nothing to send");
	}
	return content;
}
