import { Checkbox } from "@superset/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useId } from "react";
import { LuCopy, LuUndo2 } from "react-icons/lu";
import { FileIcon } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils";

interface DiffFileHeaderProps {
	path: string;
	additions: number;
	deletions: number;
	expandUnchanged: boolean;
	onToggleExpandUnchanged: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
	onCopyContents?: () => void;
	onDiscard?: () => void;
}

export function DiffFileHeader({
	path,
	additions,
	deletions,
	expandUnchanged,
	onToggleExpandUnchanged,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
	onCopyContents,
	onDiscard,
}: DiffFileHeaderProps) {
	const viewedId = useId();

	return (
		<div className="flex items-center justify-between gap-2 px-3 py-2">
			<button
				type="button"
				onClick={onToggleCollapsed}
				aria-label={collapsed ? "Expand file" : "Collapse file"}
				className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
			>
				{collapsed ? (
					<ChevronRight className="size-4" />
				) : (
					<ChevronDown className="size-4" />
				)}
			</button>
			<div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-border bg-muted/50 px-2 py-1">
				<FileIcon fileName={path} className="size-4 shrink-0" />
				<span className="truncate font-mono text-xs text-foreground">
					{path}
				</span>
				<span className="ml-1 shrink-0 font-mono text-[11px] text-muted-foreground">
					{additions > 0 && (
						<span className="text-green-700 dark:text-green-400">
							+{additions}
						</span>
					)}
					{additions > 0 && deletions > 0 && " "}
					{deletions > 0 && (
						<span className="text-red-700 dark:text-red-500">-{deletions}</span>
					)}
				</span>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<div className="flex items-center gap-1.5">
					<Checkbox
						id={viewedId}
						checked={viewed}
						onCheckedChange={() => onToggleViewed()}
						className="size-3.5 border-muted-foreground/50"
					/>
					<label
						htmlFor={viewedId}
						className="cursor-pointer select-none text-[11px] text-muted-foreground"
					>
						Viewed
					</label>
				</div>

				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleExpandUnchanged}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground"
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
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
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
