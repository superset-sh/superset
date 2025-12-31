import { AnimatePresence, motion } from "framer-motion";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { WorkspaceListItem } from "../WorkspaceListItem";
import { ProjectHeader } from "./ProjectHeader";

interface Workspace {
	id: string;
	projectId: string;
	worktreePath: string;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	tabOrder: number;
}

interface ProjectSectionProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	/** Base index for keyboard shortcuts (0-based) */
	shortcutBaseIndex: number;
}

export function ProjectSection({
	projectId,
	projectName,
	projectColor,
	workspaces,
	activeWorkspaceId,
	shortcutBaseIndex,
}: ProjectSectionProps) {
	const { isProjectCollapsed, toggleProjectCollapsed } =
		useWorkspaceSidebarStore();

	const isCollapsed = isProjectCollapsed(projectId);

	return (
		<div className="border-b border-border last:border-b-0">
			<ProjectHeader
				projectName={projectName}
				projectColor={projectColor}
				isCollapsed={isCollapsed}
				onToggleCollapse={() => toggleProjectCollapsed(projectId)}
				workspaceCount={workspaces.length}
			/>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pb-1">
							{workspaces.map((workspace, index) => (
								<WorkspaceListItem
									key={workspace.id}
									id={workspace.id}
									name={workspace.name}
									branch={workspace.branch}
									type={workspace.type}
									isActive={workspace.id === activeWorkspaceId}
									shortcutIndex={shortcutBaseIndex + index}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
