import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuArrowDown,
	LuArrowUp,
	LuChevronDown,
	LuChevronUp,
} from "react-icons/lu";
import {
	TbFocus2,
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
} from "react-icons/tb";
import type { ChangeCategory, DiffViewMode } from "shared/changes-types";
import type { SectionInfo } from "../../hooks/useFocusMode";

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
	focusMode: boolean;
	onToggleFocusMode: () => void;
	sections: SectionInfo[];
	currentSection: SectionInfo | null;
	indexWithinSection: number;
	onNavigatePrev: () => void;
	onNavigateNext: () => void;
	onNavigateToSection: (category: ChangeCategory) => void;
	isFirstFile: boolean;
	isLastFile: boolean;
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
	focusMode,
	onToggleFocusMode,
	sections,
	currentSection,
	indexWithinSection,
	onNavigatePrev,
	onNavigateNext,
	onNavigateToSection,
	isFirstFile,
	isLastFile,
}: DiffToolbarProps) {
	return (
		<div className="flex items-center gap-3 px-3 py-2.5 border-b border-r border-border bg-background sticky top-0 z-30">
			<div className="flex items-center gap-3 text-xs text-muted-foreground flex-1">
				<span>
					{viewedCount}/{totalFiles} viewed
				</span>
				{!focusMode && (
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
				)}
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

			{focusMode && currentSection && (
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={onNavigatePrev}
						disabled={isFirstFile}
						className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
						aria-label="Previous file"
					>
						<LuChevronUp className="size-3.5" />
						Prev
					</button>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex items-center gap-1.5 rounded px-2 py-0.5 text-xs transition-colors hover:bg-accent"
							>
								<span className="text-foreground font-medium">
									{currentSection.label}
								</span>
								<span className="text-muted-foreground font-mono tabular-nums">
									{indexWithinSection + 1}/{currentSection.count}
								</span>
								<LuChevronDown className="size-3 text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center" className="min-w-[160px]">
							{sections.map((section) => (
								<DropdownMenuItem
									key={section.category}
									onClick={() => onNavigateToSection(section.category)}
									className={cn(
										"flex items-center justify-between gap-4",
										section.category === currentSection.category && "bg-accent",
									)}
								>
									<span>{section.label}</span>
									<span className="text-muted-foreground font-mono text-xs tabular-nums">
										{section.count}
									</span>
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<button
						type="button"
						onClick={onNavigateNext}
						disabled={isLastFile}
						className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
						aria-label="Next file"
					>
						Next
						<LuChevronDown className="size-3.5" />
					</button>
				</div>
			)}

			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleFocusMode}
							className={cn(
								"rounded p-1 transition-colors hover:bg-accent",
								focusMode
									? "text-foreground"
									: "text-muted-foreground/60 hover:text-muted-foreground",
							)}
							aria-label={
								focusMode ? "Show all files" : "Focus mode (one file at a time)"
							}
							aria-pressed={focusMode}
						>
							<TbFocus2 className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{focusMode ? "Show all files" : "Focus mode"}
					</TooltipContent>
				</Tooltip>
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
