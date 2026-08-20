import { useMutation, useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import type { NewChatTarget } from "../useNewChatTargets";

const FALLBACK_MEDIA_TYPE = "application/octet-stream";

interface CreateTerminalWorkspaceArgs {
	target: NewChatTarget;
	baseBranch: string | null;
	agentId: string;
	message: PromptInputMessage;
}

/**
 * Creates a workspace on the target host with the claude agent sugar — the
 * host launches the terminal agent and delivers the first prompt itself.
 * Attachments upload to the same host first (they're host-local).
 */
export function useCreateTerminalWorkspace() {
	const router = useRouter();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			target,
			baseBranch,
			agentId,
			message,
		}: CreateTerminalWorkspaceArgs) => {
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
						agent: agentId,
						prompt: message.text.trim(),
						attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
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
			if (agentResult?.ok && agentResult.kind === "terminal") {
				router.push(
					`/(authenticated)/workspace/${workspaceId}?tab=${agentResult.sessionId}`,
				);
				return;
			}
			// No terminal to open — the new workspace appears in the home list.
			if (agentResult && !agentResult.ok) {
				Alert.alert("Agent failed to start", agentResult.error);
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
