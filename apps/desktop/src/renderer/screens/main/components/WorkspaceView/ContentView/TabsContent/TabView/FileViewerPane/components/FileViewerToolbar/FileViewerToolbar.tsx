import { Badge } from "@superset/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiMiniPencil } from "react-icons/hi2";
import { TbPinFilled } from "react-icons/tb";
import type { FileViewerMode } from "shared/tabs-types";
import { PaneToolbarActions } from "../../../components";
import type { SplitOrientation } from "../../../hooks";

interface FileViewerToolbarProps {
	fileName: string;
	isDirty: boolean;
	isSaving: boolean;
	viewMode: FileViewerMode;
	/** If false, this is a preview pane (italic name, can be replaced) */
	isPinned: boolean;
	isMarkdown: boolean;
	hasDiff: boolean;
	showEditableBadge: boolean;
	splitOrientation: SplitOrientation;
	onViewModeChange: (value: string) => void;
	onSplitPane: (e: React.MouseEvent) => void;
	/** Pin this pane (convert from preview to permanent) */
	onPin: () => void;
	onClosePane: (e: React.MouseEvent) => void;
}

export function FileViewerToolbar({
	fileName,
	isDirty,
	isSaving,
	viewMode,
	isPinned,
	isMarkdown,
	hasDiff,
	showEditableBadge,
	splitOrientation,
	onViewModeChange,
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
				{showEditableBadge && (
					<Badge variant="secondary" className="gap-1 text-[10px] h-4 px-1">
						<HiMiniPencil className="w-2.5 h-2.5" />
						{isSaving ? "Saving..." : "⌘S"}
					</Badge>
				)}
			</div>
			<div className="flex items-center gap-1">
				<ToggleGroup
					type="single"
					value={viewMode}
					onValueChange={onViewModeChange}
					size="sm"
					className="h-5"
				>
					{isMarkdown && (
						<ToggleGroupItem
							value="rendered"
							className="h-5 px-1.5 text-[10px]"
						>
							Rendered
						</ToggleGroupItem>
					)}
					<ToggleGroupItem value="raw" className="h-5 px-1.5 text-[10px]">
						Raw
					</ToggleGroupItem>
					{hasDiff && (
						<ToggleGroupItem value="diff" className="h-5 px-1.5 text-[10px]">
							Diff
						</ToggleGroupItem>
					)}
				</ToggleGroup>
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
