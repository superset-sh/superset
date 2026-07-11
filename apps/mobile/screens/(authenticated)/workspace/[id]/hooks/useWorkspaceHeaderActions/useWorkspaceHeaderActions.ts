import { prompt } from "@superset/alert-prompt";
import type { SelectV2Host } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import type { HostWorkspaceRow } from "@/hooks/useHostWorkspaces";
import { createAcpSession } from "@/lib/host/client";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";

export function useWorkspaceHeaderActions(
	workspace: HostWorkspaceRow | null,
	host: SelectV2Host | null,
) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [creatingChat, setCreatingChat] = useState(false);

	const startNewChat = async () => {
		if (!workspace || !host || creatingChat) return;
		setCreatingChat(true);
		try {
			const routingKey = buildHostRoutingKey(
				host.organizationId,
				host.machineId,
			);
			const sessionId = Crypto.randomUUID();
			await createAcpSession(routingKey, {
				sessionId,
				workspaceId: workspace.id,
			});
			void queryClient.invalidateQueries({
				queryKey: ["acp-sessions", "list"],
			});
			router.push(
				`/(authenticated)/workspace/${workspace.id}/chat/acp/${sessionId}`,
			);
		} catch (cause) {
			Alert.alert(
				"Could not start chat",
				cause instanceof Error ? cause.message : String(cause),
			);
		} finally {
			setCreatingChat(false);
		}
	};

	const renameWorkspace = async () => {
		if (!workspace) return;
		if (!host) {
			Alert.alert("Host is not online");
			return;
		}
		const name = await prompt({
			title: "Rename workspace",
			defaultValue: workspace.name,
			confirmText: "Rename",
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === workspace.name) return;
		try {
			const hostUrl = buildRelayHostUrl(host.organizationId, host.machineId);
			await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
				id: workspace.id,
				name: trimmed,
			});
		} catch {
			Alert.alert("Rename failed");
		}
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaces", "list"],
		});
	};

	const copyBranch = () => {
		if (workspace) void Clipboard.setStringAsync(workspace.branch);
	};

	return { startNewChat, renameWorkspace, copyBranch, creatingChat };
}
