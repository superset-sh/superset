import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useDrag, useDrop } from "react-dnd";
import { HiMiniXMark } from "react-icons/hi2";
import {
	useDeleteWorkspace,
	useReorderWorkspaces,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";

const WORKSPACE_TYPE = "WORKSPACE";

interface WorkspaceItemProps {
	id: string;
	projectId: string;
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
	title,
	isActive,
	index,
	width,
	onMouseEnter,
	onMouseLeave,
}: WorkspaceItemProps) {
	const setActive = useSetActiveWorkspace();
	const deleteWorkspace = useDeleteWorkspace();
	const reorderWorkspaces = useReorderWorkspaces();

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
				onMouseDown={() => setActive.mutate({ id })}
				onMouseEnter={onMouseEnter}
				onMouseLeave={onMouseLeave}
				className={`
					flex items-center gap-0.5 rounded-t-md transition-all w-full shrink-0 pr-6 pl-3 h-[80%]
					${
						isActive
							? "text-foreground bg-muted"
							: "text-muted-foreground hover:text-foreground hover:bg-muted/30"
					}
					${isDragging ? "opacity-30" : "opacity-100"}
				`}
				style={{ cursor: isDragging ? "grabbing" : "pointer" }}
			>
				<span className="text-sm whitespace-nowrap truncate flex-1 text-left">
					{title}
				</span>
			</button>

			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={(e) => {
					e.stopPropagation();
					deleteWorkspace.mutate({ id });
				}}
				className={cn(
					"mt-1 absolute right-1 top-1/2 -translate-y-1/2 size-5 ",
					isActive ? "opacity-90" : "opacity-0 group-hover:opacity-90",
				)}
				aria-label="Close workspace"
			>
				<HiMiniXMark className="size-4" />
			</Button>
		</div>
	);
}
