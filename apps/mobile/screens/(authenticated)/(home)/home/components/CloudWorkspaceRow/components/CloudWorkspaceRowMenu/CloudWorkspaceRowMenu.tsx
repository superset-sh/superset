import type { ReactNode } from "react";
import { itemFromCloudRow } from "@/hooks/useCloudWorkspaceItems";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HostWorkspacesCacheOps } from "@/hooks/useHostWorkspaces";
import { WorkspaceRowMenu } from "../../../WorkspaceRow/components/WorkspaceRowMenu";
import { useWorkspaceRowActions } from "../../../WorkspaceRow/hooks/useWorkspaceRowActions";

export function CloudWorkspaceRowMenu({
	row,
	cache,
	isUnread,
	onToggleUnread,
	onCopied,
	children,
}: {
	row: CloudWorkspaceRow;
	cache: HostWorkspacesCacheOps;
	isUnread: boolean;
	onToggleUnread: () => void;
	onCopied: () => void;
	children: ReactNode;
}) {
	const { renameWorkspace, deleteWorkspace, copyId, shareWorkspace } =
		useWorkspaceRowActions(
			itemFromCloudRow(row),
			cache,
			[],
			row.status,
			onCopied,
		);
	return (
		<WorkspaceRowMenu
			canRename={row.status === "ready"}
			canDelete={row.status !== "provisioning"}
			isCloud
			isUnread={isUnread}
			onToggleUnread={onToggleUnread}
			pinned={false}
			onRename={() => void renameWorkspace()}
			onDelete={deleteWorkspace}
			onCopyId={copyId}
			onShare={shareWorkspace}
		>
			{children}
		</WorkspaceRowMenu>
	);
}
