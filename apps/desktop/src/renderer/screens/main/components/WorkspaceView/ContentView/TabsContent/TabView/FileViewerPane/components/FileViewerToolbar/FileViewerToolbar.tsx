import { Badge } from "@superset/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	HiMiniLockClosed,
	HiMiniLockOpen,
	HiMiniPencil,
	HiMiniXMark,
} from "react-icons/hi2";
import { TbLayoutColumns, TbLayoutRows } from "react-icons/tb";
import type { FileViewerMode } from "shared/tabs-types";
import type { SplitOrientation } from "../../hooks/useSplitOrientation";

interface FileViewerToolbarProps {
	fileName: string;
	isDirty: boolean;
	isSaving: boolean;
	viewMode: FileViewerMode;
	isLocked: boolean;
	isMarkdown: boolean;
	hasDiff: boolean;
	showEditableBadge: boolean;
	splitOrientation: SplitOrientation;
	onViewModeChange: (value: string) => void;
	onSplitPane: (e: React.MouseEvent) => void;
	onToggleLock: () => void;
	onClosePane: (e: React.MouseEvent) => void;
}

export function FileViewerToolbar({
	fileName,
	isDirty,
	isSaving,
	viewMode,
	isLocked,
	isMarkdown,
	hasDiff,
	showEditableBadge,
	splitOrientation,
	onViewModeChange,
	onSplitPane,
	onToggleLock,
	onClosePane,
}: FileViewerToolbarProps) {
	const splitIcon =
		splitOrientation === "vertical" ? (
			<TbLayoutColumns className="size-4" />
		) : (
			<TbLayoutRows className="size-4" />
		);

	return (
		<div className="flex h-full w-full items-center justify-between px-2">
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate text-xs font-medium">
					{isDirty && <span className="text-amber-500 mr-1">●</span>}
					{fileName}
				</span>
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
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onSplitPane}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							{splitIcon}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Split pane
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleLock}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							{isLocked ? (
								<HiMiniLockClosed className="size-3" />
							) : (
								<HiMiniLockOpen className="size-3" />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{isLocked
							? "Unlock (allow file replacement)"
							: "Lock (prevent file replacement)"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onClosePane}
							className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
						>
							<HiMiniXMark className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Close
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
