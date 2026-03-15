import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useV2ProjectDnD } from "../../hooks/useV2ProjectDnD";
import type { V2SidebarWorkspace } from "../../types";
import { V2DeleteDialog } from "../V2DeleteDialog";
import { V2ProjectThumbnail } from "../V2ProjectThumbnail";
import { V2WorkspaceListItem } from "../V2WorkspaceListItem";
import { V2ProjectContextMenu } from "./V2ProjectContextMenu";

interface V2ProjectSectionProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	isCollapsed: boolean;
	isSidebarCollapsed?: boolean;
	workspaces: V2SidebarWorkspace[];
	shortcutBaseIndex: number;
	index: number;
	projectIds: string[];
	onToggleCollapse: (projectId: string) => void;
}

export function V2ProjectSection({
	projectId,
	projectName,
	githubOwner,
	isCollapsed,
	isSidebarCollapsed = false,
	workspaces,
	shortcutBaseIndex,
	index,
	projectIds,
	onToggleCollapse,
}: V2ProjectSectionProps) {
	const openModal = useOpenNewWorkspaceModal();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(projectName);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { isDragging, drag, drop } = useV2ProjectDnD({
		projectId,
		index,
		projectIds,
	});

	const workspaceIds = useMemo(() => workspaces.map((w) => w.id), [workspaces]);

	const startRename = () => {
		setRenameValue(projectName);
		setIsRenaming(true);
	};

	const submitRename = async () => {
		setIsRenaming(false);
		const trimmed = renameValue.trim();
		if (!trimmed || trimmed === projectName) return;
		try {
			await apiTrpcClient.v2Project.update.mutate({
				id: projectId,
				name: trimmed,
				slug: trimmed.toLowerCase().replace(/\s+/g, "-"),
			});
		} catch (error) {
			toast.error(
				`Failed to rename: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const cancelRename = () => {
		setIsRenaming(false);
		setRenameValue(projectName);
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await apiTrpcClient.v2Project.delete.mutate({ id: projectId });
			setIsDeleteDialogOpen(false);
			toast.success("Project deleted");

			const isInProject = workspaces.some(
				(w) =>
					!!matchRoute({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: w.id },
						fuzzy: true,
					}),
			);
			if (isInProject) {
				navigate({ to: "/" });
			}
		} catch (error) {
			toast.error(
				`Failed to delete: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			setIsDeleting(false);
		}
	};

	const handleNewWorkspace = () => {
		openModal(projectId);
	};

	if (isSidebarCollapsed) {
		return (
			<>
				<V2ProjectContextMenu
					id={projectId}
					onRename={startRename}
					onDelete={() => setIsDeleteDialogOpen(true)}
					onNewWorkspace={handleNewWorkspace}
				>
					<div
						ref={(node) => {
							drag(drop(node));
						}}
						className={cn(
							"flex flex-col items-center py-2 border-b border-border last:border-b-0",
							isDragging && "opacity-30",
						)}
					>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onToggleCollapse(projectId)}
									className={cn(
										"flex items-center justify-center size-8 rounded-md",
										"hover:bg-muted/50 transition-colors",
									)}
								>
									<V2ProjectThumbnail
										projectName={projectName}
										githubOwner={githubOwner}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" className="flex flex-col gap-0.5">
								<span className="font-medium">{projectName}</span>
								<span className="text-xs text-muted-foreground">
									{workspaces.length} workspace
									{workspaces.length !== 1 ? "s" : ""}
								</span>
							</TooltipContent>
						</Tooltip>

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
										{workspaces.map((workspace, i) => (
											<V2WorkspaceListItem
												key={workspace.id}
												id={workspace.id}
												projectId={projectId}
												name={workspace.name}
												branch={workspace.branch}
												index={i}
												workspaceIds={workspaceIds}
												shortcutIndex={shortcutBaseIndex + i}
												isCollapsed
											/>
										))}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</V2ProjectContextMenu>

				<V2DeleteDialog
					open={isDeleteDialogOpen}
					onOpenChange={setIsDeleteDialogOpen}
					onConfirm={handleDelete}
					title={`Delete "${projectName}"?`}
					description="This will permanently delete the project and all its workspaces."
					isPending={isDeleting}
				/>
			</>
		);
	}

	return (
		<>
			<div
				ref={(node) => {
					drag(drop(node));
				}}
				className={cn(
					"border-b border-border last:border-b-0",
					isDragging && "opacity-30",
				)}
			>
				<V2ProjectContextMenu
					id={projectId}
					onRename={startRename}
					onDelete={() => setIsDeleteDialogOpen(true)}
					onNewWorkspace={handleNewWorkspace}
				>
					<div
						className={cn(
							"flex items-center w-full pl-3 pr-2 py-1.5 text-sm font-medium",
							"hover:bg-muted/50 transition-colors",
						)}
					>
						{isRenaming ? (
							<div className="flex items-center gap-2 flex-1 min-w-0 py-0.5">
								<V2ProjectThumbnail
									projectName={projectName}
									githubOwner={githubOwner}
								/>
								<RenameInput
									value={renameValue}
									onChange={setRenameValue}
									onSubmit={submitRename}
									onCancel={cancelRename}
									className="h-6 px-1 py-0 text-sm -ml-1 font-medium bg-transparent border-none outline-none flex-1 min-w-0"
								/>
							</div>
						) : (
							<button
								type="button"
								onClick={() => onToggleCollapse(projectId)}
								onDoubleClick={startRename}
								className="flex items-center gap-2 flex-1 min-w-0 py-0.5 text-left cursor-pointer"
							>
								<V2ProjectThumbnail
									projectName={projectName}
									githubOwner={githubOwner}
								/>
								<span className="truncate">{projectName}</span>
								<span className="text-xs text-muted-foreground tabular-nums font-normal">
									({workspaces.length})
								</span>
							</button>
						)}

						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										handleNewWorkspace();
									}}
									onContextMenu={(e) => e.stopPropagation()}
									className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
								>
									<HiMiniPlus className="size-4 text-muted-foreground" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={4}>
								New workspace
							</TooltipContent>
						</Tooltip>

						<button
							type="button"
							onClick={() => onToggleCollapse(projectId)}
							onContextMenu={(e) => e.stopPropagation()}
							aria-expanded={!isCollapsed}
							className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
						>
							<HiChevronRight
								className={cn(
									"size-3.5 text-muted-foreground transition-transform duration-150",
									!isCollapsed && "rotate-90",
								)}
							/>
						</button>
					</div>
				</V2ProjectContextMenu>

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
								{workspaces.map((workspace, i) => (
									<V2WorkspaceListItem
										key={workspace.id}
										id={workspace.id}
										projectId={projectId}
										name={workspace.name}
										branch={workspace.branch}
										index={i}
										workspaceIds={workspaceIds}
										shortcutIndex={shortcutBaseIndex + i}
									/>
								))}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<V2DeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDelete}
				title={`Delete "${projectName}"?`}
				description="This will permanently delete the project and all its workspaces."
				isPending={isDeleting}
			/>
		</>
	);
}
