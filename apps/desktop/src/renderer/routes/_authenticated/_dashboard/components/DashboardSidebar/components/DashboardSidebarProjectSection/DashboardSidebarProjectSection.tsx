import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useDashboardSidebarProjectDnD } from "../../hooks/useDashboardSidebarProjectDnD";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";
import { DashboardSidebarDeleteDialog } from "../DashboardSidebarDeleteDialog";
import { DashboardSidebarSection as DashboardSidebarSectionComponent } from "../DashboardSidebarSection";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";
import { DashboardSidebarProjectContextMenu } from "./components/DashboardSidebarProjectContextMenu/DashboardSidebarProjectContextMenu";

interface DashboardSidebarProjectSectionProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	isCollapsed: boolean;
	isSidebarCollapsed?: boolean;
	workspaces: DashboardSidebarWorkspace[];
	sections: DashboardSidebarSection[];
	shortcutBaseIndex: number;
	index: number;
	projectIds: string[];
	onToggleCollapse: (projectId: string) => void;
}

function countProjectWorkspaces(
	workspaces: DashboardSidebarWorkspace[],
	sections: DashboardSidebarSection[],
): number {
	return (
		workspaces.length +
		sections.reduce((sum, section) => sum + section.workspaces.length, 0)
	);
}

export function DashboardSidebarProjectSection({
	projectId,
	projectName,
	githubOwner,
	isCollapsed,
	isSidebarCollapsed = false,
	workspaces,
	sections,
	shortcutBaseIndex,
	index,
	projectIds,
	onToggleCollapse,
}: DashboardSidebarProjectSectionProps) {
	const openModal = useOpenNewWorkspaceModal();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const {
		createSection,
		deleteSection,
		removeProjectFromSidebar,
		renameSection,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();

	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(projectName);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { isDragging, drag, drop } = useDashboardSidebarProjectDnD({
		projectId,
		index,
		projectIds,
	});

	const topLevelWorkspaceIds = useMemo(
		() => workspaces.map((workspace) => workspace.id),
		[workspaces],
	);

	const allSections = useMemo(
		() => sections.map((section) => ({ id: section.id, name: section.name })),
		[sections],
	);

	const flattenedCollapsedWorkspaces = useMemo(
		() => [...workspaces, ...sections.flatMap((section) => section.workspaces)],
		[sections, workspaces],
	);

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
			removeProjectFromSidebar(projectId);
			setIsDeleteDialogOpen(false);
			toast.success("Project deleted");

			const isInProject = [
				...workspaces,
				...sections.flatMap((s) => s.workspaces),
			].some(
				(workspace) =>
					!!matchRoute({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: workspace.id },
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

	const handleNewSection = () => {
		createSection(projectId);
	};

	const totalWorkspaceCount = countProjectWorkspaces(workspaces, sections);

	if (isSidebarCollapsed) {
		return (
			<>
				<DashboardSidebarProjectContextMenu
					id={projectId}
					onCreateSection={handleNewSection}
					onRemoveFromSidebar={() => removeProjectFromSidebar(projectId)}
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
									<ProjectThumbnail
										projectName={projectName}
										githubOwner={githubOwner}
									/>
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" className="flex flex-col gap-0.5">
								<span className="font-medium">{projectName}</span>
								<span className="text-xs text-muted-foreground">
									{totalWorkspaceCount} workspace
									{totalWorkspaceCount !== 1 ? "s" : ""}
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
										{flattenedCollapsedWorkspaces.map(
											(workspace, itemIndex) => (
												<DashboardSidebarWorkspaceItem
													key={workspace.id}
													id={workspace.id}
													projectId={projectId}
													name={workspace.name}
													branch={workspace.branch}
													index={itemIndex}
													workspaceIds={flattenedCollapsedWorkspaces.map(
														(item) => item.id,
													)}
													sections={allSections}
													shortcutIndex={shortcutBaseIndex + itemIndex}
													isCollapsed
												/>
											),
										)}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</DashboardSidebarProjectContextMenu>

				<DashboardSidebarDeleteDialog
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
				<DashboardSidebarProjectContextMenu
					id={projectId}
					onCreateSection={handleNewSection}
					onRemoveFromSidebar={() => removeProjectFromSidebar(projectId)}
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
								<ProjectThumbnail
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
								<ProjectThumbnail
									projectName={projectName}
									githubOwner={githubOwner}
								/>
								<span className="truncate">{projectName}</span>
								<span className="text-xs text-muted-foreground tabular-nums font-normal">
									({totalWorkspaceCount})
								</span>
							</button>
						)}

						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										handleNewWorkspace();
									}}
									onContextMenu={(event) => event.stopPropagation()}
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
							onContextMenu={(event) => event.stopPropagation()}
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
				</DashboardSidebarProjectContextMenu>

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
								{workspaces.map((workspace, itemIndex) => (
									<DashboardSidebarWorkspaceItem
										key={workspace.id}
										id={workspace.id}
										projectId={projectId}
										name={workspace.name}
										branch={workspace.branch}
										index={itemIndex}
										workspaceIds={topLevelWorkspaceIds}
										sections={allSections}
										shortcutIndex={shortcutBaseIndex + itemIndex}
									/>
								))}
								{sections.map((section, sectionIndex) => {
									const sectionShortcutBase =
										shortcutBaseIndex +
										workspaces.length +
										sections
											.slice(0, sectionIndex)
											.reduce(
												(sum, currentSection) =>
													sum + currentSection.workspaces.length,
												0,
											);

									return (
										<DashboardSidebarSectionComponent
											key={section.id}
											projectId={projectId}
											section={section}
											shortcutBaseIndex={sectionShortcutBase}
											allSections={allSections}
											onDelete={deleteSection}
											onRename={renameSection}
											onToggleCollapse={toggleSectionCollapsed}
										/>
									);
								})}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			<DashboardSidebarDeleteDialog
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
