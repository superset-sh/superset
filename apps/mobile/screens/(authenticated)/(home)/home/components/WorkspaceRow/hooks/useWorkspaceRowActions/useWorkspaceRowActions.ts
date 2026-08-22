import { prompt } from "@superset/alert-prompt";
import * as Clipboard from "expo-clipboard";
import { Alert, Share } from "react-native";
import { useCloudWorkspaceActions } from "@/hooks/useCloudWorkspaceActions";
import type { CloudWorkspaceStatus } from "@/hooks/useCloudWorkspaceItems";
import { useDeleteWorkspace } from "@/hooks/useDeleteWorkspace";
import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";
import { workspaceShareUrl } from "@/lib/web-links";

export function useWorkspaceRowActions(
	workspace: HostWorkspaceItem,
	cache: HostWorkspacesCacheOps,
	/** Set for a cloud workspace, whose name and lifetime the API owns. */
	cloudStatus?: CloudWorkspaceStatus,
) {
	const cloud = useCloudWorkspaceActions();
	const remove = useDeleteWorkspace();
	const isCloud = cloudStatus !== undefined;

	const renameWorkspace = async () => {
		const hostUrl = isCloud ? null : cache.resolveHostUrl(workspace.hostId);
		if (!isCloud && !hostUrl) {
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
			if (isCloud) {
				// The cloud row owns the name; the sandbox's copy is scratch.
				await cloud.rename(workspace.id, trimmed);
				return;
			}
			if (hostUrl) {
				await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
					id: workspace.id,
					name: trimmed,
				});
			}
		} catch {
			Alert.alert("Rename failed");
		}
		cache.invalidateHost(workspace.hostId);
	};

	const deleteWorkspace = () =>
		remove({
			id: workspace.id,
			name: workspace.name,
			hostId: workspace.hostId,
			hostUrl: cache.resolveHostUrl(workspace.hostId),
			isCloud,
		});

	const copyId = () => void Clipboard.setStringAsync(workspace.id);

	const shareWorkspace = () =>
		void Share.share({ url: workspaceShareUrl(workspace.id) });

	return {
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
	};
}
