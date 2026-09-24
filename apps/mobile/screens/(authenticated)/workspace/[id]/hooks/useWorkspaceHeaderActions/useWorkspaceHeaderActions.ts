import { useLingui } from "@lingui/react/macro";
import { prompt } from "@superset/alert-prompt";
import { useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Alert, Share } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import type { HostWorkspaceRow } from "@/hooks/useHostWorkspaces";
import type { OrgHost } from "@/hooks/useOrgHosts";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import { isSandboxHost } from "@/lib/sandbox-access";
import { workspaceShareUrl } from "@/lib/web-links";

export function useWorkspaceHeaderActions(
	workspace: HostWorkspaceRow | null,
	host: OrgHost | null,
) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const cloud = useCloudWorkspaceActions();
	// A sandbox is its own host, keyed by the workspace's id; its name and its
	// lifetime belong to the cloud row, not to anything the sandbox serves.
	const isCloud = host !== null && isSandboxHost(host.machineId);

	const renameWorkspace = async () => {
		if (!workspace) return;
		if (!host) {
			Alert.alert(
				t({
					message: "Host is not online",
				}),
			);
			return;
		}
		const name = await prompt({
			title: t({
				message: "Rename workspace",
			}),
			defaultValue: workspace.name,
			confirmText: t({ message: "Rename" }),
			selectText: true,
		});
		const trimmed = name?.trim();
		if (!trimmed || trimmed === workspace.name) return;
		try {
			if (isCloud) {
				await cloud.rename(workspace.id, trimmed);
			} else {
				const hostUrl = hostServiceUrl(host.organizationId, host.machineId);
				await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: workspace.id,
					name: trimmed,
				});
			}
		} catch {
			Alert.alert(t({ message: "Rename failed" }));
		}
		void queryClient.invalidateQueries({
			queryKey: ["host-service", "workspaces", "list"],
		});
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
		copyId,
		shareWorkspace,
	};
}
