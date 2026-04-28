import { Checkbox } from "@superset/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useId } from "react";
import { LuCopy, LuUndo2 } from "react-icons/lu";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { CLICK_HINT_TOOLTIP } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/clickModifierLabels";
import { getSidebarClickIntent } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getSidebarClickIntent";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

interface DiffFileHeaderProps {
	path: string;
	status: string;
	additions: number;
	deletions: number;
	expandUnchanged: boolean;
	onToggleExpandUnchanged?: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
	onOpenFile?: (openInNewTab?: boolean) => void;
	onOpenInExternalEditor?: () => void;
	onCopyContents?: () => void;
	onDiscard?: () => void;
}

export function DiffFileHeader({
	path,
	status,
	additions,
	deletions,
	expandUnchanged,
	onToggleExpandUnchanged,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
	onOpenFile,
	onOpenInExternalEditor,
	onCopyContents,
	onDiscard,
}: DiffFileHeaderProps) {
	const viewedId = useId();

	return (
		<div className="@container/diff-file-header flex min-w-0 flex-wrap items-center justify-between gap-1 px-2 py-1.5">
			<button
				type="button"
				onClick={onToggleCollapsed}
				aria-label={collapsed ? "Expand file" : "Collapse file"}
				className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
			>
				{collapsed ? (
					<ChevronRight className="size-3.5" />
				) : (
					<ChevronDown className="size-3.5" />
				)}
			</button>
			<StatusIndicator status={status} />
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={(event) => {
							const intent = getSidebarClickIntent(event);
							if (intent === "openInEditor") {
								onOpenInExternalEditor?.();
								return;
							}
							onOpenFile?.(intent === "openInNewTab");
						}}
						disabled={!onOpenFile && !onOpenInExternalEditor}
						aria-label="Open in file viewer"
						className="flex h-6 min-w-0 items-center gap-1.5 rounded border border-border px-1.5 py-0.5 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
					>
						<FileIcon fileName={path} className="size-3.5 shrink-0" />
						<span className="min-w-0 truncate font-mono text-xs text-foreground">
							{path}
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{CLICK_HINT_TOOLTIP}
				</TooltipContent>
			</Tooltip>
			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				{(additions > 0 || deletions > 0) && (
					<span className="font-mono text-[10px] text-muted-foreground">
						{additions > 0 && (
							<span className="text-green-700 dark:text-green-400">
								+{additions}
							</span>
						)}
						{additions > 0 && deletions > 0 && " "}
						{deletions > 0 && (
							<span className="text-red-700 dark:text-red-500">
								-{deletions}
							</span>
						)}
					</span>
				)}

				<div className="flex items-center gap-1">
					<Checkbox
						id={viewedId}
						checked={viewed}
						onCheckedChange={() => onToggleViewed()}
						className="size-3 border-muted-foreground/50"
					/>
					<label
						htmlFor={viewedId}
						className="hidden cursor-pointer select-none text-[10px] text-muted-foreground @min-[380px]/diff-file-header:inline"
					>
						Viewed
					</label>
				</div>

				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleExpandUnchanged}
							disabled={!onToggleExpandUnchanged}
							aria-label={
								expandUnchanged ? "Hide unchanged regions" : "Show all lines"
							}
							className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
						>
							{expandUnchanged ? (
								<EyeOff className="size-3.5" />
							) : (
								<Eye className="size-3.5" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{expandUnchanged ? "Hide unchanged regions" : "Show all lines"}
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onCopyContents}
							disabled={!onCopyContents}
							aria-label="Copy file contents"
							className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
						>
							<LuCopy className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Copy file contents
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onDiscard}
							disabled={!onDiscard}
							aria-label="Discard changes"
							className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
						>
							<LuUndo2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Discard changes
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
