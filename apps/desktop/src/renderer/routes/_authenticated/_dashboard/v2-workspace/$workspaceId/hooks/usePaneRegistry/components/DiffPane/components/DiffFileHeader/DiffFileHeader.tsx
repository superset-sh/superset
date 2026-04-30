import { Checkbox } from "@superset/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useId } from "react";
import { LuCheck, LuCopy, LuUndo2 } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { StatusIndicator } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/StatusIndicator";
import { CLICK_HINT_TOOLTIP } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/clickModifierLabels";
import { getSidebarClickIntent } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getSidebarClickIntent";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";
import { GIT_STAT_TEXT_CLASSES } from "../../utils/gitDecorationColors";

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
	onDiscard,
}: DiffFileHeaderProps) {
	const viewedId = useId();
	const { copyToClipboard, copied } = useCopyToClipboard();

	// Split into directory + basename so the basename stays visible when the
	// header is narrow — the directory truncates with ellipsis first, and the
	// basename truncates only as a fallback (very narrow pane or no directory).
	const lastSlash = path.lastIndexOf("/");
	const dir = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : "";
	const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

	return (
		<div className="@container/diff-file-header flex min-w-0 flex-nowrap items-center gap-1 border-y border-border bg-muted/30 px-3 py-2">
			<button
				type="button"
				onClick={onToggleCollapsed}
				aria-label={collapsed ? "Expand file" : "Collapse file"}
				className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
			>
				{collapsed ? (
					<ChevronRight className="size-3.5" />
				) : (
					<ChevronDown className="size-3.5" />
				)}
			</button>
			<Tooltip>
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
						className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
					>
						<FileIcon fileName={path} className="size-3.5 shrink-0" />
						<span className="flex min-w-0 items-baseline font-mono text-xs">
							{dir && (
								<span className="min-w-0 shrink-[1000] truncate text-muted-foreground">
									{dir}
								</span>
							)}
							<span className="min-w-0 truncate text-foreground">{name}</span>
						</span>
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{CLICK_HINT_TOOLTIP}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => void copyToClipboard(path)}
						aria-label="Copy path"
						className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
					>
						{copied ? (
							<LuCheck className="size-3.5" />
						) : (
							<LuCopy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{copied ? "Copied" : "Copy path"}
				</TooltipContent>
			</Tooltip>
			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<StatusIndicator status={status} iconClassName="size-3.5" />
				{(additions > 0 || deletions > 0) && (
					<span className="font-mono text-xs text-muted-foreground">
						{additions > 0 && (
							<span className={GIT_STAT_TEXT_CLASSES.addition}>
								+{additions}
							</span>
						)}
						{additions > 0 && deletions > 0 && " "}
						{deletions > 0 && (
							<span className={GIT_STAT_TEXT_CLASSES.deletion}>
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
						className="hidden cursor-pointer select-none text-xs text-muted-foreground @min-[380px]/diff-file-header:inline"
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
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
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
							onClick={onDiscard}
							disabled={!onDiscard}
							aria-label="Discard changes"
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
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
