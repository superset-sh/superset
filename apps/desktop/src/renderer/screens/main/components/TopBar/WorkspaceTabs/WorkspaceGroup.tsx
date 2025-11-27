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
	hoveredWorkspaceId,
	onWorkspaceHover,
}: WorkspaceGroupProps) {
	const [isCollapsed, setIsCollapsed] = useState(false);

	return (
		<div className="flex items-center h-full">
			{/* Project group badge */}
			<WorkspaceGroupHeader
				projectId={projectId}
				projectName={projectName}
				projectColor={projectColor}
				index={projectIndex}
				isCollapsed={isCollapsed}
				onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
			/>

			{/* Workspaces with colored line (collapsed shows only active tab) */}
			<div
				className="flex items-end h-full gap-1"
				style={{
					borderBottom: `2px solid ${projectColor}`,
				}}
			>
				<AnimatePresence initial={false}>
					{(isCollapsed
						? workspaces.filter((w) => w.id === activeWorkspaceId)
						: workspaces
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
								worktreePath={workspace.worktreePath}
								title={workspace.name}
								isActive={workspace.id === activeWorkspaceId}
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
