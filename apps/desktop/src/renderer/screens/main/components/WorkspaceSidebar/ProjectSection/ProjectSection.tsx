import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useDrag, useDrop } from "react-dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useReorderProjects } from "renderer/react-query/projects";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { WorkspaceListItem } from "../WorkspaceListItem";
import { ProjectHeader } from "./ProjectHeader";

const PROJECT_TYPE = "PROJECT";

interface Workspace {
	id: string;
	projectId: string;
	worktreePath: string;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	tabOrder: number;
	isUnread: boolean;
	cloudWorkspaceId?: string | null;
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
	/** Index for drag-and-drop reordering */
	index: number;
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
	index,
	isCollapsed: isSidebarCollapsed = false,
}: ProjectSectionProps) {
	const { isProjectCollapsed, toggleProjectCollapsed } =
		useWorkspaceSidebarStore();
	const openModal = useOpenNewWorkspaceModal();
	const reorderProjects = useReorderProjects();
	const utils = electronTrpc.useUtils();

	const isCollapsed = isProjectCollapsed(projectId);

	const handleNewWorkspace = () => {
		openModal(projectId);
	};

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: PROJECT_TYPE,
			item: { projectId, index, originalIndex: index },
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[projectId, index],
	);

	const [, drop] = useDrop({
		accept: PROJECT_TYPE,
		hover: (item: {
			projectId: string;
			index: number;
			originalIndex: number;
		}) => {
			if (item.index !== index) {
				utils.workspaces.getAllGrouped.setData(undefined, (oldData) => {
					if (!oldData) return oldData;
					const newGroups = [...oldData];
					const [moved] = newGroups.splice(item.index, 1);
					newGroups.splice(index, 0, moved);
					return newGroups;
				});
				item.index = index;
			}
		},
		drop: (item: {
			projectId: string;
			index: number;
			originalIndex: number;
		}) => {
			if (item.originalIndex !== item.index) {
				reorderProjects.mutate(
					{ fromIndex: item.originalIndex, toIndex: item.index },
					{
						onError: (error) =>
							toast.error(`Failed to reorder: ${error.message}`),
					},
				);
			}
		},
	});

	if (isSidebarCollapsed) {
		return (
			<div
				ref={(node) => {
					drag(drop(node));
				}}
				className={cn(
					"flex flex-col items-center py-2 border-b border-border last:border-b-0",
					isDragging && "opacity-30",
				)}
				style={{ cursor: isDragging ? "grabbing" : "grab" }}
			>
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
								{workspaces.map((workspace, wsIndex) => (
									<WorkspaceListItem
										key={workspace.id}
										id={workspace.id}
										projectId={workspace.projectId}
										worktreePath={workspace.worktreePath}
										name={workspace.name}
										branch={workspace.branch}
										type={workspace.type}
										isUnread={workspace.isUnread}
										index={wsIndex}
										shortcutIndex={shortcutBaseIndex + wsIndex}
										isCollapsed={isSidebarCollapsed}
										cloudWorkspaceId={workspace.cloudWorkspaceId}
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
		<div
			ref={(node) => {
				drag(drop(node));
			}}
			className={cn(
				"border-b border-border last:border-b-0",
				isDragging && "opacity-30",
			)}
			style={{ cursor: isDragging ? "grabbing" : "grab" }}
		>
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
							{workspaces.map((workspace, wsIndex) => (
								<WorkspaceListItem
									key={workspace.id}
									id={workspace.id}
									projectId={workspace.projectId}
									worktreePath={workspace.worktreePath}
									name={workspace.name}
									branch={workspace.branch}
									type={workspace.type}
									isUnread={workspace.isUnread}
									index={wsIndex}
									shortcutIndex={shortcutBaseIndex + wsIndex}
									cloudWorkspaceId={workspace.cloudWorkspaceId}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
