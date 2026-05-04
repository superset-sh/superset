import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	ChevronDown,
	ExternalLink,
	FileText,
	GitCompare,
	SquarePlus,
	Trash2,
	Undo2,
} from "lucide-react";
import { memo, useState } from "react";
import { modifierLabel, useSidebarFilePolicy } from "renderer/lib/clickPolicy";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/DiscardConfirmDialog";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/PathActionsMenuItems";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";

function splitPath(path: string): { dir: string; basename: string } {
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash < 0) return { dir: "", basename: path };
	return {
		dir: `${path.slice(0, lastSlash)}/`,
		basename: path.slice(lastSlash + 1),
	};
}

interface FileRowProps {
	file: ChangesetFile;
	workspaceId: string;
	worktreePath?: string;
	onSelect?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

export const FileRow = memo(function FileRow({
	file,
	workspaceId,
	worktreePath,
	onSelect,
	onOpenFile,
	onOpenInEditor,
}: FileRowProps) {
	const { dir, basename } = splitPath(file.path);
	const oldBasename =
		file.oldPath && (file.status === "renamed" || file.status === "copied")
			? splitPath(file.oldPath).basename
			: null;
	const absolutePath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, file.path)
		: undefined;
	const canDiscard = file.source.kind === "unstaged";
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: () => {
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		onError: (err) => {
			toast.error("Couldn't discard changes", { description: err.message });
		},
	});
	const confirmDiscard = () => {
		setShowDiscardConfirm(false);
		discardMutation.mutate({ workspaceId, filePath: file.path });
	};

	const policy = useSidebarFilePolicy();
	const newTabTier = policy.tierForAction("newTab");
	const externalTier = policy.tierForAction("external");

	const rowButton = (
		<div className="group relative">
			<button
				type="button"
				className="flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs hover:bg-accent/50"
				onClick={(e) => {
					const action = policy.getAction(e);
					if (action === "external") onOpenInEditor?.(file.path);
					else if (action === "newTab") onSelect?.(file.path, true);
					else if (action === "pane") onSelect?.(file.path, false);
				}}
			>
				<FileIcon fileName={basename} className="size-3.5 shrink-0" />
				<span className="flex min-w-0 flex-1 items-baseline overflow-hidden">
					{dir && <span className="truncate text-muted-foreground">{dir}</span>}
					{oldBasename && (
						<span className="truncate text-muted-foreground">
							{oldBasename}
							<span className="px-1">→</span>
						</span>
					)}
					<span className="min-w-[120px] truncate font-medium text-foreground">
						{basename}
					</span>
				</span>
				<span className="ml-auto flex shrink-0 items-center gap-1.5 group-hover:invisible">
					{(file.additions > 0 || file.deletions > 0) && (
						<span className="text-[10px] text-muted-foreground">
							{file.additions > 0 && (
								<span className="text-green-400">+{file.additions}</span>
							)}
							{file.additions > 0 && file.deletions > 0 && " "}
							{file.deletions > 0 && (
								<span className="text-red-400">-{file.deletions}</span>
							)}
						</span>
					)}
					<StatusIndicator status={file.status} />
				</span>
			</button>
			<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0.5 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100">
				{canDiscard && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label="Discard changes"
								className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
								onClick={(e) => {
									e.stopPropagation();
									setShowDiscardConfirm(true);
								}}
							>
								<Undo2 className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">Discard changes</TooltipContent>
					</Tooltip>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="More actions"
							className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
							onClick={(e) => e.stopPropagation()}
						>
							<ChevronDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuItem onSelect={() => onSelect?.(file.path)}>
							<GitCompare />
							Open Diff
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onSelect?.(file.path, true)}>
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
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);

	return (
		<ContextMenu>
			<Tooltip>
				<ContextMenuTrigger asChild>
					<TooltipTrigger asChild>{rowButton}</TooltipTrigger>
				</ContextMenuTrigger>
				<TooltipContent side="right">{policy.hint}</TooltipContent>
			</Tooltip>
			<ContextMenuContent className="w-64">
				<ContextMenuItem onSelect={() => onSelect?.(file.path)}>
					<GitCompare />
					Open Diff
				</ContextMenuItem>
				<ContextMenuItem onSelect={() => onSelect?.(file.path, true)}>
					<SquarePlus />
					Open Diff in New Tab
					{newTabTier && (
						<ContextMenuShortcut>
							{modifierLabel(newTabTier)}
						</ContextMenuShortcut>
					)}
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
					disabled={!onOpenFile || !absolutePath}
				>
					<FileText />
					Open File
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
					disabled={!onOpenFile || !absolutePath}
				>
					<SquarePlus />
					Open File in New Tab
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onOpenInEditor?.(file.path)}
					disabled={!onOpenInEditor}
				>
					<ExternalLink />
					Open in Editor
					{externalTier && (
						<ContextMenuShortcut>
							{modifierLabel(externalTier)}
						</ContextMenuShortcut>
					)}
				</ContextMenuItem>
				{absolutePath && (
					<>
						<ContextMenuSeparator />
						<PathActionsMenuItems
							absolutePath={absolutePath}
							relativePath={file.path}
						/>
					</>
				)}
				{canDiscard && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							variant="destructive"
							onSelect={() => setShowDiscardConfirm(true)}
						>
							{isDeleteAction ? <Trash2 /> : <Undo2 />}
							{isDeleteAction ? "Delete" : "Discard changes"}
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
			<DiscardConfirmDialog
				open={showDiscardConfirm}
				onOpenChange={setShowDiscardConfirm}
				title={
					isDeleteAction
						? `Delete "${basename}"?`
						: `Discard changes to "${basename}"?`
				}
				description={
					isDeleteAction
						? "This will permanently delete this file. This action cannot be undone."
						: "This will revert all changes to this file. This action cannot be undone."
				}
				confirmLabel={isDeleteAction ? "Delete" : "Discard"}
				onConfirm={confirmDiscard}
			/>
		</ContextMenu>
	);
});
