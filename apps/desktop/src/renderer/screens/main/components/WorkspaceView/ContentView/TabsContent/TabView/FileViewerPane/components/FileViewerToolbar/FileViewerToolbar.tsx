import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
	TbPinFilled,
} from "react-icons/tb";
import type { DiffViewMode } from "shared/changes-types";
import type { FileViewerMode } from "shared/tabs-types";
import { PaneToolbarActions } from "../../../components";
import type { SplitOrientation } from "../../../hooks";

interface FileViewerToolbarProps {
	fileName: string;
	isDirty: boolean;
	viewMode: FileViewerMode;
	/** If false, this is a preview pane (italic name, can be replaced) */
	isPinned: boolean;
	isMarkdown: boolean;
	hasDiff: boolean;
	splitOrientation: SplitOrientation;
	diffViewMode: DiffViewMode;
	hideUnchangedRegions: boolean;
	onViewModeChange: (value: string) => void;
	onDiffViewModeChange: (mode: DiffViewMode) => void;
	onToggleHideUnchangedRegions: () => void;
	onSplitPane: (e: React.MouseEvent) => void;
	/** Pin this pane (convert from preview to permanent) */
	onPin: () => void;
	onClosePane: (e: React.MouseEvent) => void;
}

export function FileViewerToolbar({
	fileName,
	isDirty,
	viewMode,
	isPinned,
	isMarkdown,
	hasDiff,
	splitOrientation,
	diffViewMode,
	hideUnchangedRegions,
	onViewModeChange,
	onDiffViewModeChange,
	onToggleHideUnchangedRegions,
	onSplitPane,
	onPin,
	onClosePane,
}: FileViewerToolbarProps) {
	return (
		<div className="flex h-full w-full items-center justify-between px-3">
			<div className="flex min-w-0 items-center gap-2">
				<span
					className={cn(
						"truncate text-xs text-muted-foreground",
						!isPinned && "italic",
					)}
				>
					{isDirty && <span className="text-amber-500 mr-1">●</span>}
					{fileName}
				</span>
				{!isPinned && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="text-[10px] text-muted-foreground/50 cursor-default">
								preview
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							Click again or double-click to pin
						</TooltipContent>
					</Tooltip>
				)}
			</div>
			<div className="flex items-center gap-1">
				<ToggleGroup
					type="single"
					value={viewMode}
					onValueChange={onViewModeChange}
					size="sm"
					className="h-5 bg-muted/50 rounded-md"
				>
					{isMarkdown && (
						<ToggleGroupItem
							value="rendered"
							className="h-5 px-1.5 text-[10px] text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
						>
							Rendered
						</ToggleGroupItem>
					)}
					<ToggleGroupItem
						value="raw"
						className="h-5 px-1.5 text-[10px] text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
					>
						Raw
					</ToggleGroupItem>
					{hasDiff && (
						<ToggleGroupItem
							value="diff"
							className="h-5 px-1.5 text-[10px] text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
						>
							Diff
						</ToggleGroupItem>
					)}
				</ToggleGroup>
				{viewMode === "diff" && (
					<>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() =>
										onDiffViewModeChange(
											diffViewMode === "side-by-side"
												? "inline"
												: "side-by-side",
										)
									}
									className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
								>
									{diffViewMode === "side-by-side" ? (
										<TbLayoutSidebarRightFilled className="size-3.5" />
									) : (
										<TbListDetails className="size-3.5" />
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
										"rounded p-0.5 transition-colors hover:text-muted-foreground",
										hideUnchangedRegions
											? "text-foreground"
											: "text-muted-foreground/60",
									)}
								>
									<TbFold className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{hideUnchangedRegions
									? "Show all lines"
									: "Hide unchanged regions"}
							</TooltipContent>
						</Tooltip>
					</>
				)}
				<PaneToolbarActions
					splitOrientation={splitOrientation}
					onSplitPane={onSplitPane}
					onClosePane={onClosePane}
					leadingActions={
						!isPinned ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={onPin}
										className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
									>
										<TbPinFilled className="size-3" />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									Pin (keep open)
								</TooltipContent>
							</Tooltip>
						) : null
					}
				/>
			</div>
		</div>
	);
}
