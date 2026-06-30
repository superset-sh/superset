import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ExternalLink } from "lucide-react";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/components/PathActionsMenuItems";
import { resolveFolderMenuPaths } from "./resolveFolderMenuPaths";

interface FolderHeaderProps {
	/** Display label — a folder path like "src/components", or "Root Path". */
	label: string;
	/** Folder path relative to the workspace root ("" for the root group). */
	folderPath: string;
	fileCount: number;
	isOpen: boolean;
	onToggle: () => void;
	worktreePath?: string;
	onOpenInEditor?: (path: string) => void;
}

/**
 * Collapsible header for a folder group in the changes sidebar. Shows the
 * folder path right-truncated (so the deepest segment stays visible) and the
 * file count. The whole row toggles collapse — no chevron, matching v1's
 * "grouped" variant. The full path is surfaced via the shadcn `Tooltip` (the
 * native `title` attribute doesn't render reliably in our Electron renderer —
 * `FileRow` uses the same component for its hover hint).
 *
 * Right-clicking offers the same directory actions as the tree view's folder
 * rows — Open in Editor + path actions (Copy Path / Copy Relative Path / Reveal
 * in Finder). Per-folder bulk Stage/Unstage/Discard are intentionally omitted:
 * the host-service git API has no path-scoped staging, and section-level bulk
 * actions already cover the common case.
 */
export function FolderHeader({
	label,
	folderPath,
	fileCount,
	isOpen,
	onToggle,
	worktreePath,
	onOpenInEditor,
}: FolderHeaderProps) {
	const { absolutePath, relativePath } = resolveFolderMenuPaths(
		folderPath,
		worktreePath,
	);

	return (
		<ContextMenu>
			<Tooltip>
				<ContextMenuTrigger asChild>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggle}
							aria-expanded={isOpen}
							className="flex w-full items-center gap-1.5 py-1 pr-3 pl-3 text-left text-xs text-muted-foreground hover:bg-accent/30"
						>
							{/* `dir="rtl"` right-truncates long paths so the deepest segment stays visible. */}
							<span className="min-w-0 flex-1 truncate" dir="rtl">
								{label}
							</span>
							<span className="ml-auto shrink-0 text-[11px] tabular-nums">
								{fileCount}
							</span>
						</button>
					</TooltipTrigger>
				</ContextMenuTrigger>
				<TooltipContent side="right">{label}</TooltipContent>
			</Tooltip>
			<ContextMenuContent className="w-64">
				<ContextMenuItem
					onSelect={() => onOpenInEditor?.(folderPath)}
					disabled={!onOpenInEditor}
				>
					<ExternalLink />
					Open in Editor
				</ContextMenuItem>
				{absolutePath && (
					<>
						<ContextMenuSeparator />
						<PathActionsMenuItems
							absolutePath={absolutePath}
							relativePath={relativePath}
						/>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
