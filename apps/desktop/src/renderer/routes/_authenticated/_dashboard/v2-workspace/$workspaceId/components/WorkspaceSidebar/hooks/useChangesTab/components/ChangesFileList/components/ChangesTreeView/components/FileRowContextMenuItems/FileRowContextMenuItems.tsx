import { Trans, useLingui } from "@lingui/react/macro";
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
import {
	modifierLabel,
	useChangesSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { PathActionsMenuItems } from "../../../PathActionsMenuItems";

interface FileRowContextMenuItemsProps {
	file: ChangesetFile;
	worktreePath?: string;
	sectionKind: "unstaged" | "staged" | "against-base" | "commit";
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
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
	const { t } = useLingui();
	const absolutePath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, file.path)
		: undefined;
	const canDiscard = sectionKind === "unstaged";
	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const changeKey = getChangesetFileKey(file);

	const policy = useChangesSidebarFilePolicy();
	const diffNewTabTier = policy.tierForIntent("diffNewTab");
	const fileTier = policy.tierForIntent("file");
	const externalTier = policy.tierForIntent("external");

	return (
		<>
			<DropdownMenuItem
				onSelect={() => onSelectFile?.(file.path, false, changeKey)}
			>
				<GitCompare />
				<Trans>Open Diff</Trans>
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => onSelectFile?.(file.path, true, changeKey)}
			>
				<SquarePlus />
				<Trans>Open Diff in New Tab</Trans>
				{diffNewTabTier && (
					<DropdownMenuShortcut>
						{modifierLabel(diffNewTabTier)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
				disabled={!onOpenFile || !absolutePath}
			>
				<FileText />
				<Trans>Open File</Trans>
				{fileTier && (
					<DropdownMenuShortcut>{modifierLabel(fileTier)}</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
				disabled={!onOpenFile || !absolutePath}
			>
				<SquarePlus />
				<Trans>Open File in New Tab</Trans>
			</DropdownMenuItem>
			<DropdownMenuItem
				onSelect={() => onOpenInEditor?.(file.path)}
				disabled={!onOpenInEditor}
			>
				<ExternalLink />
				<Trans>Open in Editor</Trans>
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
						menuType="dropdown"
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
						{isDeleteAction
							? t({
									message: "Delete",
								})
							: t({
									message: "Discard changes",
								})}
					</DropdownMenuItem>
				</>
			)}
		</>
	);
}
