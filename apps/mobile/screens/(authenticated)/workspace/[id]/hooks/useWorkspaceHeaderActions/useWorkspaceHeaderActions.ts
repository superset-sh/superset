import { prompt } from "@superset/alert-prompt";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Alert, Share } from "react-native";
import type { HostWorkspaceRow } from "@/hooks/useHostWorkspaces";
import type { OrgHost } from "@/hooks/useOrgHosts";
import {
	buildRelayHostUrl,
	getHostServiceClientByUrl,
} from "@/lib/host-service/client";
import { isTrpcErrorWithData } from "@/lib/host-service/errors";
import { workspaceShareUrl } from "@/lib/web-links";

export function useWorkspaceHeaderActions(
	workspace: HostWorkspaceRow | null,
	host: OrgHost | null,
) {
	const router = useRouter();
	const queryClient = useQueryClient();
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

	const destroyWorkspace = async (force: boolean) => {
		if (!workspace || !host) return;
		const hostUrl = buildRelayHostUrl(host.organizationId, host.machineId);
		try {
			await getHostServiceClientByUrl(hostUrl).workspaceCleanup.destroy.mutate({
				workspaceId: workspace.id,
				deleteBranch: false,
				force,
			});
			void queryClient.invalidateQueries({
				queryKey: ["host-service", "workspaces", "list"],
			});
			router.back();
		} catch (error) {
			if (isTrpcErrorWithData(error)) {
				if (error.data.deleteInProgress) {
					Alert.alert("Delete already in progress");
					return;
				}
				if (error.data.code === "CONFLICT" || error.data.teardownFailure) {
					Alert.alert(
						error.data.teardownFailure
							? "Teardown script failed"
							: "Worktree has uncommitted changes",
						undefined,
						[
							{ style: "cancel", text: "Cancel" },
							{
								onPress: () => void destroyWorkspace(true),
								style: "destructive",
								text: "Force delete",
							},
						],
					);
					return;
				}
			}
			Alert.alert("Delete failed");
		}
	};

	const deleteWorkspace = () => {
		if (!workspace) return;
		if (!host) {
			Alert.alert("Host is not online");
			return;
		}
		Alert.alert(
			"Delete workspace",
			`Delete "${workspace.name}"? This removes its worktree from the host.`,
			[
				{ style: "cancel", text: "Cancel" },
				{
					onPress: () => void destroyWorkspace(false),
					style: "destructive",
					text: "Delete",
				},
			],
		);
	};

	const copyId = () => {
		if (workspace) void Clipboard.setStringAsync(workspace.id);
	};

	const shareWorkspace = () => {
		if (!workspace) return;
		void Share.share({
			url: workspaceShareUrl(workspace.id),
		});
	};

	return {
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
	};
}
