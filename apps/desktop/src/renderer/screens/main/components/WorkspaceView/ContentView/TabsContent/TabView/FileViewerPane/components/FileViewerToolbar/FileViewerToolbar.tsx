import { Badge } from "@superset/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	HiMiniLockClosed,
	HiMiniLockOpen,
	HiMiniPencil,
} from "react-icons/hi2";
import type { FileViewerMode } from "shared/tabs-types";
import { PaneToolbarActions } from "../../../components";
import type { SplitOrientation } from "../../../hooks";

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
	return (
		<div className="flex h-full w-full items-center justify-between px-3">
			<div className="flex min-w-0 items-center gap-2">
				<span className="truncate text-xs text-muted-foreground">
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
				<PaneToolbarActions
					splitOrientation={splitOrientation}
					onSplitPane={onSplitPane}
					onClosePane={onClosePane}
					leadingActions={
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onToggleLock}
									className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
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
					}
				/>
			</div>
		</div>
	);
}
