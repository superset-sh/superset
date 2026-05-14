import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { ExternalLink } from "lucide-react";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/PathActionsMenuItems";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";

interface FolderContextMenuItemsProps {
	/** Folder path relative to the workspace root. */
	relativePath: string;
	worktreePath?: string;
	onOpenInEditor?: (path: string) => void;
}

/**
 * Right-click menu items for a directory row in the changes tree. Bulk
 * Stage/Unstage/Discard-for-folder aren't offered: the host-service git API
 * has no path-scoped staging, and section-level bulk actions already cover the
 * common case.
 */
export function FolderContextMenuItems({
	relativePath,
	worktreePath,
	onOpenInEditor,
}: FolderContextMenuItemsProps) {
	const absolutePath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, relativePath)
		: undefined;
	return (
		<>
			<DropdownMenuItem
				onSelect={() => onOpenInEditor?.(relativePath)}
				disabled={!onOpenInEditor}
			>
				<ExternalLink />
				Open in Editor
			</DropdownMenuItem>
			{absolutePath && (
				<>
					<DropdownMenuSeparator />
					<PathActionsMenuItems
						absolutePath={absolutePath}
						relativePath={relativePath}
					/>
				</>
			)}
		</>
	);
}
