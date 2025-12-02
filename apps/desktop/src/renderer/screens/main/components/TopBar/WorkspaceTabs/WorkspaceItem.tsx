import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import {
	useReorderWorkspaces,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";
import { useCloseSettings } from "renderer/stores/app-state";
import { useWindowsStore } from "renderer/stores/tabs/store";
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
	index: number;
	width: number;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
}

export function WorkspaceItem({
	id,
	projectId,
	worktreePath,
	title,
	isActive,
	index,
	width,
	onMouseEnter,
	onMouseLeave,
}: WorkspaceItemProps) {
	const setActive = useSetActiveWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();
	const closeSettings = useCloseSettings();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const windows = useWindowsStore((s) => s.windows);
	const panes = useWindowsStore((s) => s.panes);
	const rename = useWorkspaceRename(id, title);

	// Check if any pane in windows belonging to this workspace needs attention
	const workspaceWindows = windows.filter((w) => w.workspaceId === id);
	const workspacePaneIds = new Set(
		workspaceWindows.flatMap((w) => {
			// Extract pane IDs from the layout (which is a MosaicNode<string>)
			const collectPaneIds = (node: unknown): string[] => {
				if (typeof node === "string") return [node];
				if (
					node &&
					typeof node === "object" &&
					"first" in node &&
					"second" in node
				) {
					const branch = node as { first: unknown; second: unknown };
					return [
						...collectPaneIds(branch.first),
						...collectPaneIds(branch.second),
					];
				}
				return [];
			};
			return collectPaneIds(w.layout);
		}),
	);
	const needsAttention = Object.values(panes)
		.filter((p) => workspacePaneIds.has(p.id))
		.some((p) => p.needsAttention);

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
					className="group relative flex items-end shrink-0 h-full no-drag"
					style={{ width: `${width}px` }}
				>
					{/* Main workspace button */}
					<button
						type="button"
						ref={(node) => {
							drag(drop(node));
						}}
						onMouseDown={() => {
							if (!rename.isRenaming) {
								closeSettings();
								setActive.mutate({ id });
							}
						}}
						onDoubleClick={rename.startRename}
						onMouseEnter={onMouseEnter}
						onMouseLeave={onMouseLeave}
						className={`
							flex items-center gap-0.5 rounded-t-md transition-all w-full shrink-0 pr-6 pl-3 h-[80%]
							${
								isActive
									? "text-foreground bg-tertiary-active"
									: "text-muted-foreground hover:text-foreground hover:bg-tertiary/30"
							}
							${isDragging ? "opacity-30" : "opacity-100"}
						`}
						style={{ cursor: isDragging ? "grabbing" : "pointer" }}
					>
						{rename.isRenaming ? (
							<Input
								ref={rename.inputRef}
								variant="ghost"
								value={rename.renameValue}
								onChange={(e) => rename.setRenameValue(e.target.value)}
								onBlur={rename.submitRename}
								onKeyDown={rename.handleKeyDown}
								onClick={(e) => e.stopPropagation()}
								onMouseDown={(e) => e.stopPropagation()}
								className="flex-1 min-w-0 px-1 py-0.5"
							/>
						) : (
							<>
								<span
									className="text-sm whitespace-nowrap overflow-hidden flex-1 text-left"
									style={{
										maskImage:
											"linear-gradient(to right, black calc(100% - 16px), transparent 100%)",
										WebkitMaskImage:
											"linear-gradient(to right, black calc(100% - 16px), transparent 100%)",
									}}
								>
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
							"mt-1 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer size-5 group-hover:opacity-100",
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
