import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
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
	onOpenInEditor?: (path: string) => void;
}

export const FileRow = memo(function FileRow({
	file,
	worktreePath,
	onSelect,
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
			<span className="ml-auto flex shrink-0 items-center gap-1.5">
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
