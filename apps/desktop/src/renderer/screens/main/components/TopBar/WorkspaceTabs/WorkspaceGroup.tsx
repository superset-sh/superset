import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { WorkspaceGroupHeader } from "./WorkspaceGroupHeader";
import { WorkspaceItem } from "./WorkspaceItem";

interface Workspace {
	id: string;
	projectId: string;
	worktreePath: string;
	name: string;
	tabOrder: number;
}

interface WorkspaceGroupProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	projectIndex: number;
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	workspaceWidth: number;
	hoveredWorkspaceId: string | null;
	onWorkspaceHover: (id: string | null) => void;
}

export function WorkspaceGroup({
	projectId,
	projectName,
	projectColor,
	projectIndex,
	workspaces,
	activeWorkspaceId,
	workspaceWidth,
	hoveredWorkspaceId: _hoveredWorkspaceId,
	onWorkspaceHover,
}: WorkspaceGroupProps) {
	const [isCollapsed, setIsCollapsed] = useState(false);

	const displayedWorkspaces = isCollapsed
		? workspaces.filter((w) => w.id === activeWorkspaceId)
		: workspaces;

	const activeIndex = displayedWorkspaces.findIndex(
		(w) => w.id === activeWorkspaceId,
	);

	return (
		<div className="flex items-center">
			{/* Project group header with collapse control */}
			<WorkspaceGroupHeader
				projectId={projectId}
				projectName={projectName}
				projectColor={projectColor}
				index={projectIndex}
				isCollapsed={isCollapsed}
				isBeforeActive={activeIndex === 0}
				onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
			/>

			{/* Workspaces - each tab handles its own border */}
			<div className="flex items-center">
				<AnimatePresence initial={false}>
					{displayedWorkspaces.map((workspace, index) => (
						<motion.div
							key={workspace.id}
							initial={{ width: 0, opacity: 0 }}
							animate={{ width: "auto", opacity: 1 }}
							exit={{ width: 0, opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							style={{ overflow: "hidden" }}
						>
							<WorkspaceItem
								id={workspace.id}
								projectId={workspace.projectId}
								worktreePath={workspace.worktreePath}
								title={workspace.name}
								isActive={workspace.id === activeWorkspaceId}
								isBeforeActive={index === activeIndex - 1}
								isAfterActive={index === activeIndex + 1}
								index={index}
								width={workspaceWidth}
								projectColor={projectColor}
								onMouseEnter={() => onWorkspaceHover(workspace.id)}
								onMouseLeave={() => onWorkspaceHover(null)}
							/>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}
