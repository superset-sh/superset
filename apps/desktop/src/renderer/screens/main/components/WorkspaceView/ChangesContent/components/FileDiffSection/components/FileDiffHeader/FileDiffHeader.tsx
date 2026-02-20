import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuCopy,
	LuExternalLink,
	LuMessageSquare,
	LuPencil,
	LuUndo2,
} from "react-icons/lu";
import type { ChangedFile } from "shared/changes-types";

interface FileDiffHeaderProps {
	file: ChangedFile;
	fileKey: string;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	isViewed: boolean;
	onViewedChange: (checked: boolean) => void;
	statusBadgeColor: string;
	statusIndicator: React.ReactNode;
	showStats: boolean;
	onOpenInEditor: (e: React.MouseEvent) => void;
	onCopyPath: (e: React.MouseEvent) => void;
	isCopied: boolean;
	isEditing?: boolean;
	onToggleEdit?: () => void;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	isActioning: boolean;
	commentCount?: number;
}

export function FileDiffHeader({
	file,
	fileKey,
	isExpanded,
	onToggleExpanded,
	isViewed,
	onViewedChange,
	statusBadgeColor,
	statusIndicator,
	showStats,
	onOpenInEditor,
	onCopyPath,
	isCopied,
	isEditing,
	onToggleEdit,
	onStage,
	onUnstage,
	onDiscard,
	isActioning,
	commentCount,
}: FileDiffHeaderProps) {
	const hasAction = onStage || onUnstage;
	const isDeleteAction = file.status === "untracked" || file.status === "added";

	return (
		<div
			className={cn(
				"group flex items-center gap-2 px-3 py-1.5 w-full text-left sticky top-0 z-10 bg-muted",
			)}
		>
			<button
				type="button"
				onClick={onToggleExpanded}
				className="shrink-0 p-0.5 -ml-1 rounded hover:bg-accent transition-colors"
			>
				{isExpanded ? (
					<LuChevronDown className="size-4 text-muted-foreground" />
				) : (
					<LuChevronRight className="size-4 text-muted-foreground" />
				)}
			</button>

			<span className={cn("shrink-0 flex items-center", statusBadgeColor)}>
				{statusIndicator}
			</span>

			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="group/filename flex items-center gap-1 text-xs truncate min-w-0 hover:underline hover:text-primary cursor-pointer font-mono"
						onClick={onOpenInEditor}
						aria-label={`Open ${file.path} in editor`}
					>
						<span className="truncate">{file.path}</span>
						<LuExternalLink className="size-3 shrink-0 opacity-0 group-hover/filename:opacity-100 transition-opacity" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Click to open in editor
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onCopyPath}
						className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground hover:bg-accent"
					>
						{isCopied ? (
							<LuCheck className="size-3.5 text-green-500" />
						) : (
							<LuCopy className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{isCopied ? "Copied!" : "Copy path"}
				</TooltipContent>
			</Tooltip>

			{onToggleEdit && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onToggleEdit();
							}}
							className={cn(
								"shrink-0 rounded p-1 transition-colors",
								isEditing
									? "text-primary bg-accent"
									: "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent",
							)}
						>
							<LuPencil className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{isEditing ? "Switch to read-only" : "Edit file"}
					</TooltipContent>
				</Tooltip>
			)}

			<div className="flex-1" />

			{showStats && (
				<span className="flex items-center gap-1 text-xs font-mono shrink-0">
					{file.additions > 0 && (
						<span className="text-green-600 dark:text-green-500">
							+{file.additions}
						</span>
					)}
					{file.deletions > 0 && (
						<span className="text-red-600 dark:text-red-400">
							-{file.deletions}
						</span>
					)}
				</span>
			)}

			{commentCount != null && commentCount > 0 && (
				<span className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 shrink-0">
					<LuMessageSquare className="size-3.5" />
					{commentCount}
				</span>
			)}

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: checkbox handles keyboard events */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper for checkbox */}
			<div
				className="flex items-center gap-1.5 shrink-0 text-xs cursor-pointer select-none"
				onClick={(e) => e.stopPropagation()}
			>
				<Checkbox
					id={`viewed-${fileKey}`}
					checked={isViewed}
					onCheckedChange={(checked) => onViewedChange(checked === true)}
					className="size-3.5 border-muted-foreground/50"
				/>
				<label
					htmlFor={`viewed-${fileKey}`}
					className="text-muted-foreground cursor-pointer"
				>
					Viewed
				</label>
			</div>

			{/* biome-ignore lint/a11y/useKeyWithClickEvents: nested interactive elements handle their own events */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: this span just stops click propagation */}
			<span
				className="flex items-center gap-1 shrink-0"
				onClick={(e) => e.stopPropagation()}
			>
				{onDiscard && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
								onClick={onDiscard}
								disabled={isActioning}
							>
								<LuUndo2 className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{isDeleteAction ? "Delete" : "Discard changes"}
						</TooltipContent>
					</Tooltip>
				)}

				{hasAction && (
					<>
						{onStage && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={onStage}
										disabled={isActioning}
									>
										<HiMiniPlus className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									Stage
								</TooltipContent>
							</Tooltip>
						)}
						{onUnstage && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={onUnstage}
										disabled={isActioning}
									>
										<HiMiniMinus className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									Unstage
								</TooltipContent>
							</Tooltip>
						)}
					</>
				)}
			</span>
		</div>
	);
}
