import { useLingui } from "@lingui/react/macro";
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
import { useTerminalSeenStore } from "@/screens/(authenticated)/stores/terminalSeenStore";
import { useUnreadWorkspacesStore } from "@/screens/(authenticated)/stores/unreadWorkspacesStore";
import type { TerminalRowData } from "../../../../hooks/useHostTerminals";

export function useWorkspaceRowActions(
	workspace: HostWorkspaceItem,
	cache: HostWorkspacesCacheOps,
	/** The workspace's live sessions — marked seen when the row is read. */
	sessions: TerminalRowData[],
	/** Set for a cloud workspace, whose name and lifetime the API owns. */
	cloudStatus?: CloudWorkspaceStatus,
	/** Runs once the id is on the pasteboard, for the screen's "Copied" notice. */
	onCopied?: () => void,
) {
	const { t } = useLingui();
	const cloud = useCloudWorkspaceActions();
	const remove = useDeleteWorkspace();
	const isCloud = cloudStatus !== undefined;
	const manuallyUnread = useUnreadWorkspacesStore(
		(state) => workspace.id in state.manualUnread,
	);
	const setManualUnread = useUnreadWorkspacesStore(
		(state) => state.setManualUnread,
	);
	const clearManualUnread = useUnreadWorkspacesStore(
		(state) => state.clearManualUnread,
	);
	const markTerminalSeen = useTerminalSeenStore(
		(state) => state.markTerminalSeen,
	);

	// Desktop's isUnread: the manual mark, or any session still wanting a
	// look — reading the row has to clear both, or the dot survives it.
	const isUnread =
		manuallyUnread ||
		sessions.some(
			(session) =>
				session.attention === "review" || session.attention === "failed",
		);

	const toggleUnread = () => {
		if (!isUnread) {
			setManualUnread(workspace.id);
			return;
		}
		clearManualUnread(workspace.id);
		for (const session of sessions) {
			// Host clock only: "seen through this session's last agent event".
			if (session.lastEventAt !== null) {
				markTerminalSeen(session.terminalId, session.lastEventAt);
			}
		}
	};

	const renameWorkspace = async () => {
		const hostUrl = isCloud ? null : cache.resolveHostUrl(workspace.hostId);
		if (!isCloud && !hostUrl) {
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
			Alert.alert(t({ message: "Rename failed" }));
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

	const copyId = () =>
		void Clipboard.setStringAsync(workspace.id).then(onCopied);

	const shareWorkspace = () =>
		void Share.share({ url: workspaceShareUrl(workspace.id) });

	return {
		renameWorkspace,
		deleteWorkspace,
		copyId,
		shareWorkspace,
		isUnread,
		toggleUnread,
	};
}
