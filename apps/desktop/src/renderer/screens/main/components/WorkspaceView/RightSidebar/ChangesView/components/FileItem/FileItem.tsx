import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import {
	LuClipboard,
	LuExternalLink,
	LuFolderOpen,
	LuMinus,
	LuPlus,
	LuTrash2,
	LuUndo2,
} from "react-icons/lu";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { createFileKey, useScrollContext } from "../../../../ChangesContent";
import { useFileDrag, usePathActions } from "../../hooks";
import { getStatusColor, getStatusIndicator } from "../../utils";

interface FileItemProps {
	file: ChangedFile;
	isSelected: boolean;
	onClick: () => void;
	showStats?: boolean;
	level?: number;
	onStage?: () => void;
	onUnstage?: () => void;
	isActioning?: boolean;
	worktreePath?: string;
	onDiscard?: () => void;
	category?: ChangeCategory;
	commitHash?: string;
	/** Expanded view uses scroll-sync highlighting; collapsed view uses selection highlighting */
	isExpandedView?: boolean;
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
	worktreePath,
	onDiscard,
	category,
	commitHash,
	isExpandedView = false,
}: FileItemProps) {
	const [showDiscardDialog, setShowDiscardDialog] = useState(false);
	const { activeFileKey } = useScrollContext();
	const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const fileName = getFileName(file.path);
	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStatsDisplay =
		showStats && (file.additions > 0 || file.deletions > 0);
	const hasIndent = level > 0;
	const hasAction = onStage || onUnstage;

	const isScrollSyncActive =
		category && activeFileKey === createFileKey(file, category, commitHash);
	const isHighlighted = isExpandedView ? isScrollSyncActive : isSelected;

	const absolutePath = worktreePath ? `${worktreePath}/${file.path}` : null;

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath,
			relativePath: file.path,
			cwd: worktreePath,
		});

	const fileDragProps = useFileDrag({ absolutePath });

	const handleClick = useCallback(() => {
		if (clickTimeoutRef.current) {
			clearTimeout(clickTimeoutRef.current);
			clickTimeoutRef.current = null;
		}

		clickTimeoutRef.current = setTimeout(() => {
			clickTimeoutRef.current = null;
			onClick();
		}, 300);
	}, [onClick]);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current);
				clickTimeoutRef.current = null;
			}

			openInEditor();
		},
		[openInEditor],
	);

	useEffect(() => {
		return () => {
			if (clickTimeoutRef.current) {
				clearTimeout(clickTimeoutRef.current);
			}
		};
	}, []);

	const handleDiscardClick = () => {
		setShowDiscardDialog(true);
	};

	const handleConfirmDiscard = () => {
		setShowDiscardDialog(false);
		onDiscard?.();
	};

	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const discardLabel = isDeleteAction ? "Delete" : "Discard Changes";
	const discardDialogTitle = isDeleteAction
		? `Delete "${fileName}"?`
		: `Discard changes to "${fileName}"?`;
	const discardDialogDescription = isDeleteAction
		? "This will permanently delete this file. This action cannot be undone."
		: "This will revert all changes to this file. This action cannot be undone.";

	const fileContent = (
		<div
			{...fileDragProps}
			className={cn(
				"group w-full flex items-stretch gap-1 px-1.5 text-left rounded-sm",
				"hover:bg-accent/50 cursor-pointer transition-colors overflow-hidden",
				isHighlighted && "bg-accent",
			)}
		>
			{hasIndent && <LevelIndicators level={level} />}
			<button
				type="button"
				onClick={handleClick}
				onDoubleClick={handleDoubleClick}
				className={cn(
					"flex items-center gap-1.5 flex-1 min-w-0",
					hasIndent ? "py-0.5" : "py-1",
				)}
			>
				<span
					className={cn("shrink-0 flex items-center text-xs", statusBadgeColor)}
				>
					{statusIndicator}
				</span>
				<span className="flex-1 min-w-0 flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="text-xs text-start truncate overflow-hidden text-ellipsis">
								{fileName}
							</span>
						</TooltipTrigger>
						<TooltipContent side="right">{file.path}</TooltipContent>
					</Tooltip>
					{showStatsDisplay && (
						<span className="flex items-center gap-0.5 text-[10px] font-mono shrink-0 whitespace-nowrap opacity-60">
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
				</span>
			</button>

			{hasAction && (
				<div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
					{onStage && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5 hover:bg-accent"
									onClick={(e) => {
										e.stopPropagation();
										onStage();
									}}
									disabled={isActioning}
								>
									<HiMiniPlus className="size-3" />
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
									className="size-5 hover:bg-accent"
									onClick={(e) => {
										e.stopPropagation();
										onUnstage();
									}}
									disabled={isActioning}
								>
									<HiMiniMinus className="size-3" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="right">Unstage</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
		</div>
	);

	if (!worktreePath) {
		return fileContent;
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>{fileContent}</ContextMenuTrigger>
				<ContextMenuContent className="w-48">
					<ContextMenuItem onClick={copyPath}>
						<LuClipboard className="mr-2 size-4" />
						Copy Path
					</ContextMenuItem>
					<ContextMenuItem onClick={copyRelativePath}>
						<LuClipboard className="mr-2 size-4" />
						Copy Relative Path
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={revealInFinder}>
						<LuFolderOpen className="mr-2 size-4" />
						Reveal in Finder
					</ContextMenuItem>
					<ContextMenuItem onClick={openInEditor}>
						<LuExternalLink className="mr-2 size-4" />
						Open in Editor
					</ContextMenuItem>

					{(onStage || onUnstage || onDiscard) && <ContextMenuSeparator />}

					{onStage && (
						<ContextMenuItem onClick={onStage} disabled={isActioning}>
							<LuPlus className="mr-2 size-4" />
							Stage
						</ContextMenuItem>
					)}

					{onUnstage && (
						<ContextMenuItem onClick={onUnstage} disabled={isActioning}>
							<LuMinus className="mr-2 size-4" />
							Unstage
						</ContextMenuItem>
					)}

					{onDiscard && (
						<ContextMenuItem
							onClick={handleDiscardClick}
							disabled={isActioning}
							className="text-destructive focus:text-destructive"
						>
							{isDeleteAction ? (
								<LuTrash2 className="mr-2 size-4" />
							) : (
								<LuUndo2 className="mr-2 size-4" />
							)}
							{discardLabel}
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>

			<AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
				<AlertDialogContent className="max-w-[340px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{discardDialogTitle}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{discardDialogDescription}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setShowDiscardDialog(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleConfirmDiscard}
						>
							{isDeleteAction ? "Delete" : "Discard"}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
