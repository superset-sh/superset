import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { useNewChatPreferencesStore } from "../../components/NewChatWidget/stores/newChatPreferencesStore";

export function useStartWorkspaceChat(
	resolveHostUrl: (hostId: string) => string | null,
) {
	const router = useRouter();
	const modelId = useNewChatPreferencesStore((state) => state.modelId);

	const mutation = useMutation({
		mutationFn: async ({
			workspace,
			prompt,
		}: {
			workspace: HostWorkspaceItem;
			prompt: string;
		}) => {
			const hostUrl = resolveHostUrl(workspace.hostId);
			if (!hostUrl) throw new Error("Host is not online");
			const result = await getHostServiceClientByUrl(hostUrl).agents.run.mutate(
				{
					workspaceId: workspace.id,
					agent: "superset",
					prompt,
					model: modelId,
				},
			);
			return { workspaceId: workspace.id, sessionId: result.sessionId };
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

	const { mutate } = mutation;
	const startChat = useCallback(
		(workspace: HostWorkspaceItem) => {
			Alert.prompt(
				"New chat",
				`Start a new chat in ${workspace.name}`,
				[
					{ style: "cancel", text: "Cancel" },
					{
						text: "Start",
						onPress: (prompt?: string) => {
							const trimmed = prompt?.trim();
							if (trimmed) mutate({ workspace, prompt: trimmed });
						},
					},
				],
				"plain-text",
			);
		},
		[mutate],
	);

	return { startChat, isPending: mutation.isPending };
}
