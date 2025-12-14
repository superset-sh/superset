import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import type { ChangedFile } from "shared/changes-types";
import { getStatusColor, getStatusIndicator } from "../../utils";

interface FileItemProps {
	file: ChangedFile;
	isSelected: boolean;
	onClick: () => void;
	showStats?: boolean;
	/** Number of level indentations (for tree view) */
	level?: number;
	/** Callback for staging the file (shown on hover for unstaged files) */
	onStage?: () => void;
	/** Callback for unstaging the file (shown on hover for staged files) */
	onUnstage?: () => void;
	/** Whether the action is currently pending */
	isActioning?: boolean;
}

function LevelIndicators({ level }: { level: number }) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={i} className="w-3 self-stretch border-r border-border" />
			))}
		</div>
	);
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

export function FileItem({
	file,
	isSelected,
	onClick,
	showStats = true,
	level = 0,
	onStage,
	onUnstage,
	isActioning = false,
}: FileItemProps) {
	const fileName = getFileName(file.path);
	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStatsDisplay =
		showStats && (file.additions > 0 || file.deletions > 0);
	const hasIndent = level > 0;
	const hasAction = onStage || onUnstage;

	return (
		<div
			className={cn(
				"group w-full flex items-stretch gap-1.5 px-2 text-left rounded-sm",
				"hover:bg-accent/50 cursor-pointer transition-colors overflow-hidden",
				isSelected && "bg-accent",
			)}
		>
			{hasIndent && <LevelIndicators level={level} />}
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"flex items-center gap-1.5 flex-1 min-w-0",
					hasIndent ? "py-1" : "py-1.5",
				)}
			>
				<span className={cn("shrink-0 flex items-center", statusBadgeColor)}>
					{statusIndicator}
				</span>
				<span className="flex-1 min-w-0 text-xs truncate overflow-hidden text-ellipsis">
					{fileName}
				</span>

				{showStatsDisplay && (
					<div className="flex items-center gap-0.5 text-xs font-mono shrink-0 whitespace-nowrap">
						{file.additions > 0 && (
							<span className="text-green-600 dark:text-green-400">
								+{file.additions}
							</span>
						)}
						{file.deletions > 0 && (
							<span className="text-red-600 dark:text-red-400">
								-{file.deletions}
							</span>
						)}
					</div>
				)}
			</button>

			{hasAction && (
				<div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
					{onStage && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-5 w-5"
									onClick={(e) => {
										e.stopPropagation();
										onStage();
									}}
									disabled={isActioning}
								>
									<HiMiniPlus className="w-3.5 h-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Stage</TooltipContent>
						</Tooltip>
					)}
					{onUnstage && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-5 w-5"
									onClick={(e) => {
										e.stopPropagation();
										onUnstage();
									}}
									disabled={isActioning}
								>
									<HiMiniMinus className="w-3.5 h-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Unstage</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);
}
