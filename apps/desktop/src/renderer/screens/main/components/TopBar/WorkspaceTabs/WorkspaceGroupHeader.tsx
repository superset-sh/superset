import { useDrag, useDrop } from "react-dnd";
import { HiChevronDown, HiChevronRight, HiFolder } from "react-icons/hi2";
import { useReorderProjects } from "renderer/react-query/projects";
import { WorkspaceGroupContextMenu } from "./WorkspaceGroupContextMenu";

const PROJECT_GROUP_TYPE = "PROJECT_GROUP";

interface WorkspaceGroupHeaderProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	isCollapsed: boolean;
	index: number;
	onToggleCollapse: () => void;
}

/**
 * Determines if a color is light or dark to choose appropriate text color
 */
function isLightColor(hexColor: string): boolean {
	const hex = hexColor.replace("#", "");
	const r = Number.parseInt(hex.substring(0, 2), 16);
	const g = Number.parseInt(hex.substring(2, 4), 16);
	const b = Number.parseInt(hex.substring(4, 6), 16);
	// Using relative luminance formula
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.6;
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
	const textColor = isLightColor(projectColor)
		? "rgba(0,0,0,0.8)"
		: "rgba(255,255,255,0.95)";
	const subtleTextColor = isLightColor(projectColor)
		? "rgba(0,0,0,0.5)"
		: "rgba(255,255,255,0.7)";

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
			className="flex items-center h-full pl-1"
			style={{
				transition: "border-bottom 0.3s ease",
				borderBottom: `2px solid ${isCollapsed ? "transparent" : projectColor}`,
			}}
		>
			<WorkspaceGroupContextMenu
				projectId={projectId}
				projectName={projectName}
				projectColor={projectColor}
			>
				<button
					type="button"
					ref={(node) => {
						drag(node);
						drop(node);
					}}
					title={`${projectName} · Click to ${isCollapsed ? "expand" : "collapse"} · Right-click for options`}
					className={`
						group flex items-center gap-1.5 mr-2 my-1
						pl-2 pr-2 py-1 rounded-md
						text-xs font-medium cursor-pointer select-none
						transition-all duration-150 shrink-0 no-drag
						hover:brightness-110
						active:brightness-95
						${isDragging ? "opacity-30 scale-95" : "opacity-100"}
						${isOver ? "ring-2 ring-white/30" : ""}
					`}
					onClick={onToggleCollapse}
					style={{
						backgroundColor: projectColor,
						boxShadow: `0 1px 2px ${projectColor}30`,
					}}
				>
					{/* Folder icon */}
					<HiFolder
						className="size-3.5 shrink-0"
						style={{ color: subtleTextColor }}
					/>

					{/* Project name */}
					<span
						className="truncate max-w-[100px] font-semibold tracking-tight"
						style={{ color: textColor }}
					>
						{projectName}
					</span>

					{/* Collapse/expand chevron */}
					<span style={{ color: subtleTextColor }}>
						{isCollapsed ? (
							<HiChevronRight className="size-3" />
						) : (
							<HiChevronDown className="size-3" />
						)}
					</span>
				</button>
			</WorkspaceGroupContextMenu>
		</div>
	);
}
