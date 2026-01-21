import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuArrowDown, LuArrowUp } from "react-icons/lu";
import {
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
} from "react-icons/tb";
import type { DiffViewMode } from "shared/changes-types";

interface DiffToolbarProps {
	viewedCount: number;
	totalFiles: number;
	totalAdditions: number;
	totalDeletions: number;
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
	diffViewMode: DiffViewMode;
	onDiffViewModeChange: (mode: DiffViewMode) => void;
	hideUnchangedRegions: boolean;
	onToggleHideUnchangedRegions: () => void;
}

export function DiffToolbar({
	viewedCount,
	totalFiles,
	totalAdditions,
	totalDeletions,
	pushCount,
	pullCount,
	hasUpstream,
	diffViewMode,
	onDiffViewModeChange,
	hideUnchangedRegions,
	onToggleHideUnchangedRegions,
}: DiffToolbarProps) {
	return (
		<div className="flex items-center gap-3 px-3 py-1.5 border-b border-border bg-background sticky top-0 z-30">
			<div className="flex items-center gap-3 text-xs text-muted-foreground flex-1">
				<span>
					{viewedCount}/{totalFiles} viewed
				</span>
				<span className="flex items-center gap-1 font-mono">
					{totalFiles} files
					{totalAdditions > 0 && (
						<span className="text-green-600 dark:text-green-500">
							+{totalAdditions}
						</span>
					)}
					{totalDeletions > 0 && (
						<span className="text-red-600 dark:text-red-400">
							-{totalDeletions}
						</span>
					)}
				</span>
				{hasUpstream && (pushCount > 0 || pullCount > 0) && (
					<span className="flex items-center gap-2">
						{pushCount > 0 && (
							<span className="flex items-center gap-0.5">
								<LuArrowUp className="size-3" />
								{pushCount}
							</span>
						)}
						{pullCount > 0 && (
							<span className="flex items-center gap-0.5">
								<LuArrowDown className="size-3" />
								{pullCount}
							</span>
						)}
					</span>
				)}
			</div>

			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() =>
								onDiffViewModeChange(
									diffViewMode === "side-by-side" ? "inline" : "side-by-side",
								)
							}
							className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground hover:bg-accent"
							aria-label={
								diffViewMode === "side-by-side"
									? "Switch to inline diff"
									: "Switch to side-by-side diff"
							}
						>
							{diffViewMode === "side-by-side" ? (
								<TbLayoutSidebarRightFilled className="size-4" />
							) : (
								<TbListDetails className="size-4" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{diffViewMode === "side-by-side"
							? "Switch to inline diff"
							: "Switch to side by side diff"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleHideUnchangedRegions}
							className={cn(
								"rounded p-1 transition-colors hover:bg-accent",
								hideUnchangedRegions
									? "text-foreground"
									: "text-muted-foreground/60 hover:text-muted-foreground",
							)}
							aria-label={
								hideUnchangedRegions
									? "Show all lines"
									: "Hide unchanged regions"
							}
							aria-pressed={hideUnchangedRegions}
						>
							<TbFold className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{hideUnchangedRegions ? "Show all lines" : "Hide unchanged regions"}
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
