import { useDrag, useDrop } from "react-dnd";
import { useReorderProjects } from "renderer/react-query/projects";

const PROJECT_GROUP_TYPE = "PROJECT_GROUP";

interface WorkspaceGroupHeaderProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	isCollapsed: boolean;
	index: number;
	onToggleCollapse: () => void;
}

export function WorkspaceGroupHeader({
	projectId,
	projectName,
	projectColor,
	isCollapsed,
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
		<div
			className="flex items-center h-full"
			style={{
				transition: "border-bottom 0.3s ease",
				borderBottom: `2px solid ${isCollapsed ? "transparent" : projectColor}`,
			}}
		>
			<button
				type="button"
				ref={(node) => {
					drag(node);
					drop(node);
				}}
				className={`
					flex items-center justify-center mr-2
					px-3 py-1 rounded-full
					text-xs font-medium cursor-pointer select-none
					transition-all shrink-0 no-drag
					${isDragging ? "opacity-30" : "opacity-100"}
					${isOver ? "ring-2 ring-white/20" : ""}
				`}
				onClick={onToggleCollapse}
				style={{
					backgroundColor: projectColor,
					color: "white",
				}}
			>
				<span className="truncate max-w-[100px]">{projectName}</span>
			</button>
		</div>
	);
}
