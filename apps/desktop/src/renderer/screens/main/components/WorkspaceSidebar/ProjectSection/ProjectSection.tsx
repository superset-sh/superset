import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HiMiniPlus, HiOutlineBolt } from "react-icons/hi2";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
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
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	/** Base index for keyboard shortcuts (0-based) */
	shortcutBaseIndex: number;
}

export function ProjectSection({
	projectId,
	projectName,
	workspaces,
	activeWorkspaceId,
	shortcutBaseIndex,
}: ProjectSectionProps) {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { isProjectCollapsed, toggleProjectCollapsed } =
		useWorkspaceSidebarStore();
	const createWorkspace = useCreateWorkspace();
	const openModal = useOpenNewWorkspaceModal();

	const isCollapsed = isProjectCollapsed(projectId);

	const handleQuickCreate = () => {
		setDropdownOpen(false);
		toast.promise(createWorkspace.mutateAsync({ projectId }), {
			loading: "Creating workspace...",
			success: "Workspace created",
			error: (err) =>
				err instanceof Error ? err.message : "Failed to create workspace",
		});
	};

	const handleNewWorkspace = () => {
		setDropdownOpen(false);
		openModal(projectId);
	};

	return (
		<div className="border-b border-border last:border-b-0">
			<ProjectHeader
				projectName={projectName}
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
									projectId={workspace.projectId}
									worktreePath={workspace.worktreePath}
									name={workspace.name}
									branch={workspace.branch}
									type={workspace.type}
									isActive={workspace.id === activeWorkspaceId}
									isUnread={workspace.isUnread}
									index={index}
									shortcutIndex={shortcutBaseIndex + index}
								/>
							))}
							<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										disabled={createWorkspace.isPending}
										className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50"
									>
										<HiMiniPlus className="size-3.5" />
										<span>Add workspace</span>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									sideOffset={4}
									className="w-44 rounded-lg border-border/40 bg-popover/95 p-1 shadow-lg backdrop-blur-sm"
								>
									<DropdownMenuItem
										onClick={handleNewWorkspace}
										className="rounded-md text-[13px]"
									>
										<HiMiniPlus className="size-[14px] opacity-60" />
										New Workspace
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={handleQuickCreate}
										disabled={createWorkspace.isPending}
										className="rounded-md text-[13px]"
									>
										<HiOutlineBolt className="size-[14px] opacity-60" />
										Quick Create
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
