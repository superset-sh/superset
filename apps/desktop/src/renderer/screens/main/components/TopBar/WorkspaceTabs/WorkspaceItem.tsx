import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import {
	useReorderWorkspaces,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import { useTabs } from "renderer/stores";
import { DeleteWorkspaceDialog } from "./DeleteWorkspaceDialog";
import { useWorkspaceRename } from "./useWorkspaceRename";
import { WorkspaceItemContextMenu } from "./WorkspaceItemContextMenu";

const WORKSPACE_TYPE = "WORKSPACE";

interface WorkspaceItemProps {
	id: string;
	projectId: string;
	worktreePath: string;
	title: string;
	isActive: boolean;
	isBeforeActive: boolean;
	isAfterActive: boolean;
	index: number;
	width: number;
	projectColor: string;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export function WorkspaceItem({
	id,
	projectId,
	worktreePath,
	title,
	isActive,
	isBeforeActive,
	isAfterActive,
	index,
	width,
	projectColor,
	onMouseEnter,
	onMouseLeave,
}: WorkspaceItemProps) {
	const setActive = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const tabs = useTabs();
	const rename = useWorkspaceRename(id, title);

	const needsAttention = tabs
		.filter((t) => t.workspaceId === id)
		.some((t) => t.needsAttention);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: WORKSPACE_TYPE,
			item: { id, projectId, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[id, projectId, index],
	);

	const [, drop] = useDrop({
		accept: WORKSPACE_TYPE,
		hover: (item: { id: string; projectId: string; index: number }) => {
			// Only allow reordering within the same project
			if (item.projectId === projectId && item.index !== index) {
				reorderWorkspaces.mutate({
					projectId,
					fromIndex: item.index,
					toIndex: index,
				});
				item.index = index;
			}
		},
	});

	return (
		<>
			<WorkspaceItemContextMenu
				worktreePath={worktreePath}
				onRename={rename.startRename}
			>
				<div
					className="group relative flex items-center shrink-0 h-6 no-drag"
					style={{ width: `${width}px` }}
				>
					{/* Main workspace button */}
					<button
						type="button"
						ref={(node) => {
							drag(drop(node));
						}}
						onMouseDown={() => !rename.isRenaming && setActive.mutate({ id })}
						onDoubleClick={rename.startRename}
						onMouseEnter={onMouseEnter}
						onMouseLeave={onMouseLeave}
						className={cn(
							"flex items-center gap-1 w-full h-6 shrink-0 pr-6 pl-3 transition-all duration-150 m-0",
							isActive
								? "text-foreground bg-background"
								: "text-muted-foreground hover:text-foreground hover:bg-accent/40",
							isDragging ? "opacity-30" : "opacity-100",
						)}
						style={{
							cursor: isDragging ? "grabbing" : "pointer",
							// All tabs have 2px borders - just different colors
							// Active: colored top/left/right, transparent bottom
							// Inactive: transparent top/left/right, colored bottom
							border: "2px solid transparent",
							borderTopColor: isActive
								? `color-mix(in srgb, ${projectColor} 60%, transparent)`
								: "transparent",
							borderLeftColor: isActive
								? `color-mix(in srgb, ${projectColor} 60%, transparent)`
								: "transparent",
							borderRightColor: isActive
								? `color-mix(in srgb, ${projectColor} 60%, transparent)`
								: "transparent",
							borderBottomColor: isActive
								? "transparent"
								: `color-mix(in srgb, ${projectColor} 50%, transparent)`,
							// Border radius: active has top corners, adjacent tabs have corner touching active
							borderRadius: isActive
								? "6px 6px 0 0"
								: isBeforeActive
									? "0 0 6px 0"
									: isAfterActive
										? "0 0 0 6px"
										: "0",
						}}
					>
						{rename.isRenaming ? (
							<input
								ref={rename.inputRef}
								type="text"
								value={rename.renameValue}
								onChange={(e) => rename.setRenameValue(e.target.value)}
								onBlur={rename.submitRename}
								onKeyDown={rename.handleKeyDown}
								onClick={(e) => e.stopPropagation()}
								onMouseDown={(e) => e.stopPropagation()}
								className="flex-1 min-w-0 bg-muted border border-primary rounded px-1 py-0.5 text-sm outline-none"
							/>
						) : (
							<>
								<span className="text-sm whitespace-nowrap truncate flex-1 text-left">
									{title}
								</span>
								{needsAttention && (
									<span className="relative flex size-2 shrink-0">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
										<span className="relative inline-flex size-2 rounded-full bg-red-500" />
									</span>
								)}
							</>
						)}
					</button>

					<Button
						type="button"
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							setShowDeleteDialog(true);
						}}
						className={cn(
							"absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-4 group-hover:opacity-100",
							isActive ? "opacity-90" : "opacity-0",
						)}
						aria-label="Close workspace"
					>
						<HiMiniXMark />
					</Button>
				</div>
			</WorkspaceItemContextMenu>

			<DeleteWorkspaceDialog
				workspaceId={id}
				workspaceName={title}
				open={showDeleteDialog}
				onOpenChange={setShowDeleteDialog}
			/>
		</>
	);
}
