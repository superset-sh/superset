import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiChevronRight } from "react-icons/hi2";
import { LuPalette, LuPencil, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useReorderProjectChildren } from "renderer/react-query/workspaces";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { SECTION_DND_TYPE, STROKE_WIDTH } from "../constants";
import { useSectionDropZone } from "../hooks";
import { RenameInput } from "../RenameInput";
import type { SectionDragItem, SidebarWorkspace } from "../types";
import { reorderProjectChildrenInCache } from "../utils/reorderProjectChildrenInCache";
import { WorkspaceList } from "../WorkspaceList";
import { useSectionMutations } from "./useSectionMutations";

interface WorkspaceSectionProps {
	sectionId: string;
	projectId: string;
	index: number;
	name: string;
	isCollapsed: boolean;
	color?: string | null;
	workspaces: SidebarWorkspace[];
	shortcutBaseIndex: number;
	isSidebarCollapsed?: boolean;
	allSections?: { id: string; name: string }[];
	orderedWorkspaceIds?: string[];
}

export function WorkspaceSection({
	sectionId,
	projectId,
	index,
	name,
	isCollapsed,
	color = null,
	workspaces,
	shortcutBaseIndex,
	isSidebarCollapsed = false,
	allSections = [],
	orderedWorkspaceIds,
}: WorkspaceSectionProps) {
	const utils = electronTrpc.useUtils();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(name);
	const mutations = useSectionMutations(sectionId);

	const hasColor = color && color !== PROJECT_COLOR_DEFAULT;
	const sectionBorderStyle = {
		borderLeft: hasColor
			? `2px solid ${color}`
			: "2px solid var(--color-border)",
	};

	const dropZone = useSectionDropZone({
		canAccept: (item) =>
			item.projectId === projectId && item.sectionId !== sectionId,
		targetSectionId: sectionId,
		onAutoExpand: isCollapsed ? () => mutations.toggle() : undefined,
	});

	const reorderProjectChildren = useReorderProjectChildren();

	const commitSectionReorder = (item: SectionDragItem) => {
		if (item.originalIndex === item.index) return;
		reorderProjectChildren.mutate(
			{
				projectId: item.projectId,
				fromIndex: item.originalIndex,
				toIndex: item.index,
			},
			{
				onError: (error) => {
					void utils.workspaces.getAllGrouped.invalidate();
					toast.error(`Failed to reorder project items: ${error.message}`);
				},
			},
		);
	};

	const [{ isSectionDragging }, sectionDrag] = useDrag(
		() => ({
			type: SECTION_DND_TYPE,
			item: (): SectionDragItem => ({
				kind: "section",
				sectionId,
				projectId,
				index,
				originalIndex: index,
			}),
			end: (item, monitor) => {
				if (!item) return;
				if (monitor.didDrop()) return;
				commitSectionReorder(item);
			},
			collect: (monitor) => ({ isSectionDragging: monitor.isDragging() }),
		}),
		[sectionId, projectId, index, reorderProjectChildren],
	);

	const [, sectionDrop] = useDrop({
		accept: SECTION_DND_TYPE,
		hover: (item: SectionDragItem) => {
			if (item.projectId !== projectId || item.index === index) return;
			utils.workspaces.getAllGrouped.setData(undefined, (oldData) =>
				reorderProjectChildrenInCache(oldData, projectId, item.index, index),
			);
			item.index = index;
		},
		drop: (item: SectionDragItem) => {
			commitSectionReorder(item);
			if (item.originalIndex !== item.index) return { reordered: true };
		},
	});

	const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleClick = useCallback(() => {
		if (clickTimer.current) return;
		clickTimer.current = setTimeout(() => {
			clickTimer.current = null;
			mutations.toggle();
		}, 250);
	}, [mutations]);

	const handleDoubleClick = useCallback(() => {
		if (clickTimer.current) {
			clearTimeout(clickTimer.current);
			clickTimer.current = null;
		}
		setRenameValue(name);
		setIsRenaming(true);
	}, [name]);

	const handleStartRename = () => {
		setRenameValue(name);
		setIsRenaming(true);
	};

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed && trimmed !== name) {
			mutations.rename(trimmed);
		}
		setIsRenaming(false);
	};

	const handleCancelRename = () => {
		setRenameValue(name);
		setIsRenaming(false);
	};

	if (isSidebarCollapsed) {
		return (
			<div
				ref={(node) => {
					sectionDrop(node);
				}}
				{...dropZone.handlers}
				className={cn(
					"relative flex flex-col -ml-0.5",
					isSectionDragging && "opacity-30",
				)}
				style={sectionBorderStyle}
			>
				<div
					ref={(node) => {
						sectionDrag(node);
					}}
					className="absolute inset-y-0 -left-1 w-2 cursor-grab"
				/>
				<WorkspaceList
					workspaces={workspaces}
					shortcutBaseIndex={shortcutBaseIndex}
					sectionId={sectionId}
					sections={allSections}
					isCollapsed={isSidebarCollapsed}
					orderedWorkspaceIds={orderedWorkspaceIds}
				/>
			</div>
		);
	}

	return (
		<div
			{...dropZone.handlers}
			className={cn(isSectionDragging && "opacity-30")}
			style={sectionBorderStyle}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div
						ref={(node) => {
							sectionDrag(sectionDrop(node));
						}}
						className={cn(
							"flex items-center w-full pl-2 pr-2 py-2 text-[11px] font-medium uppercase tracking-wider",
							"text-muted-foreground hover:bg-muted/50 transition-colors",
							dropZone.isDropTarget &&
								!dropZone.isDragOver &&
								"border border-dashed border-primary/20 rounded-sm",
							dropZone.isDragOver &&
								"bg-primary/10 border border-solid border-primary/40 rounded-sm",
						)}
						style={{ cursor: isSectionDragging ? "grabbing" : "grab" }}
					>
						{isRenaming ? (
							<div className="flex items-center gap-1.5 flex-1 min-w-0">
								<RenameInput
									value={renameValue}
									onChange={setRenameValue}
									onSubmit={handleSubmitRename}
									onCancel={handleCancelRename}
									className="h-5 px-1 py-0 text-[11px] tracking-wider font-medium bg-transparent border-none outline-none flex-1 min-w-0 text-muted-foreground"
								/>
							</div>
						) : (
							<button
								type="button"
								onClick={handleClick}
								onDoubleClick={handleDoubleClick}
								className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
							>
								<HiChevronRight
									className={cn(
										"size-3 shrink-0 transition-transform duration-150",
										!isCollapsed && "rotate-90",
									)}
								/>
								<span className="truncate">{name}</span>
								<span className="text-[10px] tabular-nums font-normal">
									({workspaces.length})
								</span>
							</button>
						)}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={handleStartRename}>
						<LuPencil className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
						Rename Section
					</ContextMenuItem>
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuPalette className="size-4 mr-2" strokeWidth={STROKE_WIDTH} />
							Set Color
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-36">
							{PROJECT_COLORS.map((c) => {
								const isDefault = c.value === PROJECT_COLOR_DEFAULT;
								return (
									<ContextMenuItem
										key={c.value}
										onSelect={() => mutations.setColor(c.value)}
										className="flex items-center gap-2"
									>
										<span
											className={cn(
												"size-3 rounded-full border",
												isDefault
													? "border-border bg-muted"
													: "border-border/50",
											)}
											style={
												isDefault ? undefined : { backgroundColor: c.value }
											}
										/>
										<span>{c.name}</span>
										{(isDefault ? !hasColor : color === c.value) && (
											<span className="ml-auto text-xs text-muted-foreground">
												✓
											</span>
										)}
									</ContextMenuItem>
								);
							})}
						</ContextMenuSubContent>
					</ContextMenuSub>
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={mutations.remove}
						disabled={mutations.isDeleting}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2
							className="size-4 mr-2 text-destructive"
							strokeWidth={STROKE_WIDTH}
						/>
						{mutations.isDeleting ? "Deleting..." : "Delete Section"}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pl-2">
							<WorkspaceList
								workspaces={workspaces}
								shortcutBaseIndex={shortcutBaseIndex}
								sectionId={sectionId}
								sections={allSections}
								orderedWorkspaceIds={orderedWorkspaceIds}
							/>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
