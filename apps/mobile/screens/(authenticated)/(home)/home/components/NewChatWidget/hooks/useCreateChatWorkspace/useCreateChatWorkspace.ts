import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { NewChatTarget } from "../useNewChatTargets";

const FALLBACK_MEDIA_TYPE = "application/octet-stream";

interface CreateChatWorkspaceArgs {
	target: NewChatTarget;
	baseBranch: string | null;
	modelId: string;
	message: PromptInputMessage;
}

/**
 * Creates a workspace on the target host with the "superset" agent sugar —
 * the host creates the cloud chat session and fires the first message
 * itself. Attachments upload to the same host first (they're host-local).
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
			const client = getHostServiceClientByUrl(target.hostUrl);

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

			return client.workspaces.create.mutate({
				id: randomUUID(),
				projectId: target.projectId,
				baseBranch: baseBranch ?? undefined,
				agents: [
					{
						agent: "superset",
						prompt: message.text.trim(),
						attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
						model: modelId,
					},
				],
			});
		},
		onSuccess: (result) => {
			void queryClient.invalidateQueries({
				queryKey: ["host-service", "workspaces", "list"],
			});
			const workspaceId = result.workspace.id;
			const agentResult = result.agents[0];
			if (agentResult?.ok && agentResult.kind === "chat") {
				router.push(
					`/(authenticated)/workspace/${workspaceId}/chat/${agentResult.sessionId}`,
				);
				return;
			}
			// No thread to open — the new workspace appears in the home list.
			if (agentResult && !agentResult.ok) {
				Alert.alert("Chat failed to start", agentResult.error);
			}
		},
		onError: (error) => {
			Alert.alert(
				"Could not create workspace",
				error instanceof Error ? error.message : String(error),
			);
		},
	});
}
