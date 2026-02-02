import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { HiChevronRight } from "react-icons/hi2";
import {
	LuClipboard,
	LuExternalLink,
	LuFolderOpen,
	LuMinus,
	LuPlus,
	LuUndo2,
} from "react-icons/lu";
import { usePathActions } from "../../hooks";

interface FolderRowProps {
	name: string;
	isExpanded: boolean;
	onToggle: (expanded: boolean) => void;
	children: ReactNode;
	level?: number;
	fileCount?: number;
	variant?: "tree" | "grouped";
	folderPath: string;
	worktreePath: string;
	onStageAll?: () => void;
	onUnstageAll?: () => void;
	onDiscardAll?: () => void;
	isActioning?: boolean;
}

function LevelIndicators({ level }: { level: number }) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0">
			{Array.from({ length: level }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={i} className="w-3 self-stretch border-r border-border/50" />
			))}
		</div>
	);
}

function FolderRowHeader({
	name,
	level,
	fileCount,
	isGrouped,
	isExpanded,
}: {
	name: string;
	level: number;
	fileCount?: number;
	isGrouped: boolean;
	isExpanded: boolean;
}) {
	return (
		<>
			{!isGrouped && (
				<HiChevronRight
					className={cn(
						"size-2.5 text-muted-foreground shrink-0 transition-transform duration-150",
						isExpanded && "rotate-90",
					)}
				/>
			)}
			{!isGrouped && <LevelIndicators level={level} />}
			<div className="flex items-center gap-1 flex-1 min-w-0">
				<span
					className={cn(
						"truncate",
						isGrouped
							? "w-0 grow text-left"
							: "flex-1 min-w-0 text-xs text-foreground",
					)}
					dir={isGrouped ? "rtl" : undefined}
				>
					{name}
				</span>
				{fileCount !== undefined && (
					<span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
						{fileCount}
					</span>
				)}
			</div>
		</>
	);
}

export function FolderRow({
	name,
	isExpanded,
	onToggle,
	children,
	level = 0,
	fileCount,
	variant = "tree",
	folderPath,
	worktreePath,
	onStageAll,
	onUnstageAll,
	onDiscardAll,
	isActioning = false,
}: FolderRowProps) {
	const isGrouped = variant === "grouped";
	const isRoot = folderPath === "";
	const absolutePath = isRoot ? worktreePath : `${worktreePath}/${folderPath}`;

	const { copyPath, copyRelativePath, revealInFinder, openInEditor } =
		usePathActions({
			absolutePath,
			relativePath: folderPath || undefined,
		});

	const triggerContent = (
		<CollapsibleTrigger
			className={cn(
				"w-full flex items-center gap-1.5 px-1.5 py-1 text-left rounded-sm",
				"hover:bg-accent/50 cursor-pointer transition-colors",
				"text-xs items-stretch py-0.5",
				isGrouped && "text-muted-foreground",
			)}
		>
			<FolderRowHeader
				name={name}
				level={level}
				fileCount={fileCount}
				isGrouped={isGrouped}
				isExpanded={isExpanded}
			/>
		</CollapsibleTrigger>
	);

	const contextMenuContent = (
		<ContextMenuContent className="w-48">
			<ContextMenuItem onClick={copyPath}>
				<LuClipboard className="mr-2 size-4" />
				Copy Path
			</ContextMenuItem>
			{!isRoot && (
				<ContextMenuItem onClick={copyRelativePath}>
					<LuClipboard className="mr-2 size-4" />
					Copy Relative Path
				</ContextMenuItem>
			)}
			<ContextMenuSeparator />
			<ContextMenuItem onClick={revealInFinder}>
				<LuFolderOpen className="mr-2 size-4" />
				Reveal in Finder
			</ContextMenuItem>
			<ContextMenuItem onClick={openInEditor}>
				<LuExternalLink className="mr-2 size-4" />
				Open in Editor
			</ContextMenuItem>

			{(onStageAll || onUnstageAll || onDiscardAll) && <ContextMenuSeparator />}

			{onStageAll && (
				<ContextMenuItem onClick={onStageAll} disabled={isActioning}>
					<LuPlus className="mr-2 size-4" />
					Stage All
				</ContextMenuItem>
			)}

			{onUnstageAll && (
				<ContextMenuItem onClick={onUnstageAll} disabled={isActioning}>
					<LuMinus className="mr-2 size-4" />
					Unstage All
				</ContextMenuItem>
			)}

			{onDiscardAll && (
				<ContextMenuItem
					onClick={onDiscardAll}
					disabled={isActioning}
					className="text-destructive focus:text-destructive"
				>
					<LuUndo2 className="mr-2 size-4" />
					Discard All
				</ContextMenuItem>
			)}
		</ContextMenuContent>
	);

	return (
		<Collapsible
			open={isExpanded}
			onOpenChange={onToggle}
			className={cn("min-w-0", isGrouped && "overflow-hidden")}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>{triggerContent}</ContextMenuTrigger>
				{contextMenuContent}
			</ContextMenu>
			<CollapsibleContent
				className={cn(
					"min-w-0",
					isGrouped && "ml-1.5 border-l border-border pl-0.5",
				)}
			>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
