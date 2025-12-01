import { useDrag, useDrop } from "react-dnd";
import { HiChevronRight } from "react-icons/hi2";
import { useReorderProjects } from "renderer/react-query/projects";
import { WorkspaceGroupContextMenu } from "./WorkspaceGroupContextMenu";

const PROJECT_GROUP_TYPE = "PROJECT_GROUP";

interface WorkspaceGroupHeaderProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	isCollapsed: boolean;
	isBeforeActive: boolean;
	index: number;
	onToggleCollapse: () => void;
}

export function WorkspaceGroupHeader({
	projectId,
	projectName,
	projectColor,
	isCollapsed,
	isBeforeActive,
	index,
	onToggleCollapse,
}: WorkspaceGroupHeaderProps) {
	const reorderProjects = useReorderProjects();

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: PROJECT_GROUP_TYPE,
			item: { projectId, index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[projectId, index],
	);

	const [{ isOver }, drop] = useDrop(
		() => ({
			accept: PROJECT_GROUP_TYPE,
			hover: (item: { projectId: string; index: number }) => {
				if (item.index !== index) {
					reorderProjects.mutate({
						fromIndex: item.index,
						toIndex: index,
					});
					item.index = index;
				}
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
			}),
		}),
		[index, reorderProjects],
	);

	return (
		<WorkspaceGroupContextMenu
			projectId={projectId}
			projectName={projectName}
			projectColor={projectColor}
		>
			<div className="flex items-center h-7">
				<button
					type="button"
					ref={(node) => {
						drag(node);
						drop(node);
					}}
					className={`
						flex items-center justify-center gap-1 h-6
						px-2
						text-xs font-medium cursor-pointer select-none
						transition-all duration-150 shrink-0 no-drag
						text-muted-foreground hover:text-foreground hover:bg-accent/40
						${isDragging ? "opacity-30" : "opacity-100"}
						${isOver ? "bg-accent/30" : ""}
					`}
					style={{
						borderBottom: `2px solid color-mix(in srgb, ${projectColor} 50%, transparent)`,
						borderRadius: isBeforeActive ? "0 0 6px 0" : "0",
					}}
					onClick={onToggleCollapse}
				>
					<HiChevronRight
						className={`size-3 transition-transform duration-150 ${isCollapsed ? "" : "rotate-90"}`}
						style={{ color: projectColor }}
					/>
					<span className="truncate max-w-[100px]">{projectName}</span>
				</button>
			</div>
		</WorkspaceGroupContextMenu>
	);
}
