import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ProjectWithWorkspaces } from "main/lib/trpc/routers/projects";
import { WorkspaceGroupHeader } from "./WorkspaceGroupHeader";
import { WorkspaceItem } from "./WorkspaceItem";

interface WorkspaceGroupProps {
	project: ProjectWithWorkspaces;
	projectIndex: number;
	workspaceWidth: number;
	hoveredWorkspaceId: string | null;
	onWorkspaceHover: (id: string | null) => void;
}

export function WorkspaceGroup({
	project,
	projectIndex,
	workspaceWidth,
	hoveredWorkspaceId,
	onWorkspaceHover,
}: WorkspaceGroupProps) {
	const [isCollapsed, setIsCollapsed] = useState(false);

	return (
		<div className="flex items-center h-full">
			{/* Project group badge */}
			<WorkspaceGroupHeader
				projectId={project.id}
				projectName={project.name}
				projectColor={project.color}
				index={projectIndex}
				isCollapsed={isCollapsed}
				onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
			/>

			{/* Workspaces with colored line (collapsed shows only active tab) */}
			<div
				className="flex items-end h-full gap-1"
				style={{
					borderBottom: `2px solid ${project.color}`,
				}}
			>
				<AnimatePresence initial={false}>
					{(isCollapsed
						? project.workspaces.filter((w) => w.isActive)
						: project.workspaces
					).map((workspace, index) => (
						<motion.div
							key={workspace.id}
							initial={{ width: 0, opacity: 0 }}
							animate={{ width: "auto", opacity: 1 }}
							exit={{ width: 0, opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="h-full"
							style={{ overflow: "hidden" }}
						>
							<WorkspaceItem
								id={workspace.id}
								projectId={workspace.projectId}
								title={workspace.name}
								isActive={workspace.isActive}
								index={index}
								width={workspaceWidth}
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
