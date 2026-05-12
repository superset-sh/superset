import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@superset/ui/dropdown-menu";
import {
	ExternalLink,
	FileText,
	GitCompare,
	SquarePlus,
	Trash2,
	Undo2,
} from "lucide-react";
import { modifierLabel, useSidebarFilePolicy } from "renderer/lib/clickPolicy";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/PathActionsMenuItems";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";

interface FileRowContextMenuItemsProps {
	file: ChangesetFile;
	worktreePath?: string;
	sectionKind: "unstaged" | "staged" | "against-base" | "commit";
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
	/**
	 * Ask the parent to run the discard flow for this file. The confirm dialog
	 * lives on `ChangesTreeView`, not here — Pierre unmounts `renderContextMenu`
	 * output when the menu closes, which would tear down a dialog rendered
	 * inside it before the user could confirm.
	 */
	onRequestDiscard?: (file: ChangesetFile) => void;
}

/**
 * Menu items for a file row in the changes tree — used both by the right-click
 * context menu and the hover more-actions dropdown. Mirrors the `FileRow`
 * menus so the action vocabulary is the same in folders and tree view.
 */
export function FileRowContextMenuItems({
	file,
	worktreePath,
	sectionKind,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
	onRequestDiscard,
}: FileRowContextMenuItemsProps) {
	const absolutePath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, file.path)
		: undefined;
	const canDiscard = sectionKind === "unstaged";
	const isDeleteAction = file.status === "untracked" || file.status === "added";

	const policy = useSidebarFilePolicy();
	const newTabTier = policy.tierForAction("newTab");
	const externalTier = policy.tierForAction("external");

	return (
		<>
			<DropdownMenuItem onSelect={() => onSelectFile?.(file.path)}>
				<GitCompare />
				Open Diff
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={() => onSelectFile?.(file.path, true)}>
				<SquarePlus />
				Open Diff in New Tab
				{newTabTier && (
					<DropdownMenuShortcut>
						{modifierLabel(newTabTier)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
				disabled={!onOpenFile || !absolutePath}
			>
				<FileText />
				Open File
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
				disabled={!onOpenFile || !absolutePath}
			>
				<SquarePlus />
				Open File in New Tab
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => onOpenInEditor?.(file.path)}
				disabled={!onOpenInEditor}
			>
				<ExternalLink />
				Open in Editor
				{externalTier && (
					<DropdownMenuShortcut>
						{modifierLabel(externalTier)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			{absolutePath && (
				<>
					<DropdownMenuSeparator />
					<PathActionsMenuItems
						absolutePath={absolutePath}
						relativePath={file.path}
					/>
				</>
			)}
			{canDiscard && onRequestDiscard && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => onRequestDiscard(file)}
					>
						{isDeleteAction ? <Trash2 /> : <Undo2 />}
						{isDeleteAction ? "Delete" : "Discard changes"}
					</DropdownMenuItem>
				</>
			)}
		</>
	);
}
