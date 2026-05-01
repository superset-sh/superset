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
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ChevronDown } from "lucide-react";
import { memo } from "react";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/FilesTab/components/WorkspaceFilesTreeItem/components/PathActionsMenuItems";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import {
	CLICK_HINT_TOOLTIP,
	MOD_CLICK_LABEL,
	SHIFT_CLICK_LABEL,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/clickModifierLabels";
import { getSidebarClickIntent } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getSidebarClickIntent";
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
	worktreePath?: string;
	onSelect?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

export const FileRow = memo(function FileRow({
	file,
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

	const rowButton = (
		<div className="group relative">
			<button
				type="button"
				className="flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs hover:bg-accent/50"
				onClick={(e) => {
					const intent = getSidebarClickIntent(e);
					if (intent === "openInEditor") {
						onOpenInEditor?.(file.path);
					} else {
						onSelect?.(file.path, intent === "openInNewTab");
					}
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
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuItem onSelect={() => onSelect?.(file.path)}>
							Open Diff
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onSelect?.(file.path, true)}>
							Open Diff in New Tab
							<DropdownMenuShortcut>{SHIFT_CLICK_LABEL}</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
							disabled={!onOpenFile || !absolutePath}
						>
							Open File
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
							disabled={!onOpenFile || !absolutePath}
						>
							Open File in New Tab
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => onOpenInEditor?.(file.path)}
							disabled={!onOpenInEditor}
						>
							Open in Editor
							<DropdownMenuShortcut>{MOD_CLICK_LABEL}</DropdownMenuShortcut>
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
				<TooltipContent side="right">{CLICK_HINT_TOOLTIP}</TooltipContent>
			</Tooltip>
			<ContextMenuContent className="w-56">
				<ContextMenuItem onSelect={() => onSelect?.(file.path)}>
					Open Diff
				</ContextMenuItem>
				<ContextMenuItem onSelect={() => onSelect?.(file.path, true)}>
					Open Diff in New Tab
					<ContextMenuShortcut>{SHIFT_CLICK_LABEL}</ContextMenuShortcut>
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
					disabled={!onOpenFile || !absolutePath}
				>
					Open File
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
					disabled={!onOpenFile || !absolutePath}
				>
					Open File in New Tab
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onOpenInEditor?.(file.path)}
					disabled={!onOpenInEditor}
				>
					Open in Editor
					<ContextMenuShortcut>{MOD_CLICK_LABEL}</ContextMenuShortcut>
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
			</ContextMenuContent>
		</ContextMenu>
	);
});
