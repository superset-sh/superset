import { AnimatePresence, motion } from "framer-motion";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
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
	isUnread: boolean;
}

interface ProjectSectionProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	githubOwner: string | null;
	mainRepoPath: string;
	workspaces: Workspace[];
	/** Base index for keyboard shortcuts (0-based) */
	shortcutBaseIndex: number;
	/** Whether the sidebar is in collapsed mode */
	isCollapsed?: boolean;
}

export function ProjectSection({
	projectId,
	projectName,
	projectColor,
	githubOwner,
	mainRepoPath,
	workspaces,
	shortcutBaseIndex,
	isCollapsed: isSidebarCollapsed = false,
}: ProjectSectionProps) {
	const { isProjectCollapsed, toggleProjectCollapsed } =
		useWorkspaceSidebarStore();
	const openModal = useOpenNewWorkspaceModal();

	const isCollapsed = isProjectCollapsed(projectId);

	const handleNewWorkspace = () => {
		openModal(projectId);
	};

	// When sidebar is collapsed, show compact view with just thumbnail and workspace icons
	if (isSidebarCollapsed) {
		return (
			<div className="flex flex-col items-center py-2 border-b border-border last:border-b-0">
				<ProjectHeader
					projectId={projectId}
					projectName={projectName}
					projectColor={projectColor}
					githubOwner={githubOwner}
					mainRepoPath={mainRepoPath}
					isCollapsed={isCollapsed}
					isSidebarCollapsed={isSidebarCollapsed}
					onToggleCollapse={() => toggleProjectCollapsed(projectId)}
					workspaceCount={workspaces.length}
					onNewWorkspace={handleNewWorkspace}
				/>
				<AnimatePresence initial={false}>
					{!isCollapsed && (
						<motion.div
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: "auto", opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="overflow-hidden w-full"
						>
							<div className="flex flex-col items-center gap-1 pt-1">
								{workspaces.map((workspace, index) => (
									<WorkspaceListItem
										key={workspace.id}
										id={workspace.id}
										projectId={workspace.projectId}
										worktreePath={workspace.worktreePath}
										name={workspace.name}
										branch={workspace.branch}
										type={workspace.type}
										isUnread={workspace.isUnread}
										index={index}
										shortcutIndex={shortcutBaseIndex + index}
										isCollapsed={isSidebarCollapsed}
									/>
								))}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	}

	return (
		<div className="border-b border-border last:border-b-0">
			<ProjectHeader
				projectId={projectId}
				projectName={projectName}
				projectColor={projectColor}
				githubOwner={githubOwner}
				mainRepoPath={mainRepoPath}
				isCollapsed={isCollapsed}
				isSidebarCollapsed={isSidebarCollapsed}
				onToggleCollapse={() => toggleProjectCollapsed(projectId)}
				workspaceCount={workspaces.length}
				onNewWorkspace={handleNewWorkspace}
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
									projectId={workspace.projectId}
									worktreePath={workspace.worktreePath}
									name={workspace.name}
									branch={workspace.branch}
									type={workspace.type}
									isUnread={workspace.isUnread}
									index={index}
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
