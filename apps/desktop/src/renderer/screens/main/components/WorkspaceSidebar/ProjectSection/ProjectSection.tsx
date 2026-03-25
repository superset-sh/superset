import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useReorderProjects } from "renderer/react-query/projects";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useSectionDropZone } from "../hooks";
import type { SidebarSection, SidebarWorkspace } from "../types";
import { WorkspaceListItem } from "../WorkspaceListItem";
import { WorkspaceSection } from "../WorkspaceSection";
import { ProjectHeader } from "./ProjectHeader";

const PROJECT_TYPE = "PROJECT";

type TopLevelChild =
	| {
			kind: "workspace";
			workspace: SidebarWorkspace;
			topLevelIndex: number;
			shortcutIndex: number;
	  }
	| {
			kind: "section";
			section: SidebarSection;
			topLevelIndex: number;
			shortcutBaseIndex: number;
	  };

interface ProjectSectionProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	githubOwner: string | null;
	mainRepoPath: string;
	hideImage: boolean;
	iconUrl: string | null;
	workspaces: SidebarWorkspace[];
	sections: SidebarSection[];
	topLevelItems: {
		id: string;
		kind: "workspace" | "section";
		tabOrder: number;
	}[];
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
	hideImage,
	iconUrl,
	workspaces,
	sections,
	topLevelItems,
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
	const totalWorkspaceCount =
		workspaces.length +
		sections.reduce((sum, s) => sum + s.workspaces.length, 0);

	const { orderedWorkspaceIds, topLevelChildren } = useMemo(() => {
		const topLevelWorkspacesById = new Map(
			workspaces.map((workspace) => [workspace.id, workspace]),
		);
		const sectionsById = new Map(
			sections.map((section) => [section.id, section]),
		);
		const ids: string[] = [];
		let shortcutOffset = shortcutBaseIndex;
		const renderables: TopLevelChild[] = [];

		for (const [topLevelIndex, item] of topLevelItems.entries()) {
			if (item.kind === "workspace") {
				const workspace = topLevelWorkspacesById.get(item.id);
				if (!workspace) continue;
				ids.push(workspace.id);
				const shortcutIndex = shortcutOffset;
				shortcutOffset += 1;
				renderables.push({
					kind: "workspace",
					workspace,
					topLevelIndex,
					shortcutIndex,
				});
				continue;
			}

			const section = sectionsById.get(item.id);
			if (!section) continue;
			for (const workspace of section.workspaces) {
				ids.push(workspace.id);
			}
			renderables.push({
				kind: "section",
				section,
				topLevelIndex,
				shortcutBaseIndex: shortcutOffset,
			});
			shortcutOffset += section.workspaces.length;
		}

		return {
			orderedWorkspaceIds: ids,
			topLevelChildren: renderables,
		};
	}, [shortcutBaseIndex, sections, topLevelItems, workspaces]);

	const topUngroupedDropZone = useSectionDropZone({
		canAccept: (item) =>
			item.sectionId !== null && item.projectId === projectId,
		targetSectionId: null,
		targetRootPlacement: "top",
	});

	const bottomUngroupedDropZone = useSectionDropZone({
		canAccept: (item) =>
			item.sectionId !== null && item.projectId === projectId,
		targetSectionId: null,
		targetRootPlacement: "bottom",
	});
	const showRootDropZones =
		topUngroupedDropZone.isDropTarget || bottomUngroupedDropZone.isDropTarget;

	const getRootDropZoneClassName = (
		isDropTarget: boolean,
		isDragOver: boolean,
	) =>
		cn(
			"transition-colors rounded-sm",
			isDropTarget && !isDragOver && "border border-dashed border-primary/20",
			isDragOver && "bg-primary/5 border border-solid border-primary/30",
		);

	const handleNewWorkspace = () => {
		openModal(projectId);
	};

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: PROJECT_TYPE,
			item: { projectId, index, originalIndex: index },
			end: (item, monitor) => {
				if (!item) return;
				if (monitor.didDrop()) return;
				if (item.originalIndex !== item.index) {
					reorderProjects.mutate(
						{ fromIndex: item.originalIndex, toIndex: item.index },
						{
							onError: (error) =>
								toast.error(`Failed to reorder: ${error.message}`),
							onSettled: () => utils.workspaces.getAllGrouped.invalidate(),
						},
					);
				}
			},
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
		}),
		[projectId, index, reorderProjects],
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
						onSettled: () => utils.workspaces.getAllGrouped.invalidate(),
					},
				);
				return { reordered: true };
			}
		},
	});

	const projectHeaderRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		drag(drop(projectHeaderRef));
	}, [drag, drop]);

	if (isSidebarCollapsed) {
		return (
			<div
				ref={projectHeaderRef}
				className={cn(
					"flex flex-col items-center py-2 border-b border-border last:border-b-0",
					isDragging && "opacity-30",
					isDragging && "cursor-grabbing",
				)}
			>
				<div className="flex w-full justify-center">
					<ProjectHeader
						projectId={projectId}
						projectName={projectName}
						projectColor={projectColor}
						githubOwner={githubOwner}
						mainRepoPath={mainRepoPath}
						hideImage={hideImage}
						iconUrl={iconUrl}
						isCollapsed={isCollapsed}
						isSidebarCollapsed={isSidebarCollapsed}
						onToggleCollapse={() => toggleProjectCollapsed(projectId)}
						workspaceCount={totalWorkspaceCount}
						onNewWorkspace={handleNewWorkspace}
					/>
				</div>
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
								{showRootDropZones && topLevelChildren.length > 0 && (
									<div
										{...topUngroupedDropZone.handlers}
										className={cn(
											"w-full h-5",
											getRootDropZoneClassName(
												topUngroupedDropZone.isDropTarget,
												topUngroupedDropZone.isDragOver,
											),
										)}
									/>
								)}
								{topLevelChildren.map((item) =>
									item.kind === "workspace" ? (
										<WorkspaceListItem
											key={item.workspace.id}
											id={item.workspace.id}
											projectId={item.workspace.projectId}
											worktreePath={item.workspace.worktreePath}
											name={item.workspace.name}
											branch={item.workspace.branch}
											type={item.workspace.type}
											isUnread={item.workspace.isUnread}
											index={item.topLevelIndex}
											shortcutIndex={item.shortcutIndex}
											isCollapsed={isSidebarCollapsed}
											sectionId={null}
											sections={sections}
											orderedWorkspaceIds={orderedWorkspaceIds}
										/>
									) : (
										<WorkspaceSection
											key={item.section.id}
											sectionId={item.section.id}
											projectId={projectId}
											index={item.topLevelIndex}
											name={item.section.name}
											isCollapsed={item.section.isCollapsed}
											color={item.section.color}
											workspaces={item.section.workspaces}
											shortcutBaseIndex={item.shortcutBaseIndex}
											isSidebarCollapsed
											allSections={sections}
											orderedWorkspaceIds={orderedWorkspaceIds}
										/>
									),
								)}
								{showRootDropZones && topLevelChildren.length > 0 && (
									<div
										{...bottomUngroupedDropZone.handlers}
										className={cn(
											"w-full h-5",
											getRootDropZoneClassName(
												bottomUngroupedDropZone.isDropTarget,
												bottomUngroupedDropZone.isDragOver,
											),
										)}
									/>
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		);
	}

	return (
		<div
			ref={projectHeaderRef}
			className={cn(
				"border-b border-border last:border-b-0",
				isDragging && "opacity-30",
				isDragging && "cursor-grabbing",
			)}
		>
			<div className="w-full">
				<ProjectHeader
					projectId={projectId}
					projectName={projectName}
					projectColor={projectColor}
					githubOwner={githubOwner}
					mainRepoPath={mainRepoPath}
					hideImage={hideImage}
					iconUrl={iconUrl}
					isCollapsed={isCollapsed}
					isSidebarCollapsed={isSidebarCollapsed}
					onToggleCollapse={() => toggleProjectCollapsed(projectId)}
					workspaceCount={totalWorkspaceCount}
					onNewWorkspace={handleNewWorkspace}
				/>
			</div>

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
							{showRootDropZones && topLevelChildren.length === 0 && (
								<div
									{...topUngroupedDropZone.handlers}
									className={cn(
										"transition-colors rounded-sm min-h-8",
										getRootDropZoneClassName(
											topUngroupedDropZone.isDropTarget,
											topUngroupedDropZone.isDragOver,
										),
									)}
								/>
							)}
							{showRootDropZones && topLevelChildren.length > 0 && (
								<div
									{...topUngroupedDropZone.handlers}
									className={cn(
										"h-5",
										getRootDropZoneClassName(
											topUngroupedDropZone.isDropTarget,
											topUngroupedDropZone.isDragOver,
										),
									)}
								/>
							)}
							{topLevelChildren.map((item) =>
								item.kind === "workspace" ? (
									<WorkspaceListItem
										key={item.workspace.id}
										id={item.workspace.id}
										projectId={item.workspace.projectId}
										worktreePath={item.workspace.worktreePath}
										name={item.workspace.name}
										branch={item.workspace.branch}
										type={item.workspace.type}
										isUnread={item.workspace.isUnread}
										index={item.topLevelIndex}
										shortcutIndex={item.shortcutIndex}
										sectionId={null}
										sections={sections}
										orderedWorkspaceIds={orderedWorkspaceIds}
									/>
								) : (
									<WorkspaceSection
										key={item.section.id}
										sectionId={item.section.id}
										projectId={projectId}
										index={item.topLevelIndex}
										name={item.section.name}
										isCollapsed={item.section.isCollapsed}
										color={item.section.color}
										workspaces={item.section.workspaces}
										shortcutBaseIndex={item.shortcutBaseIndex}
										allSections={sections}
										orderedWorkspaceIds={orderedWorkspaceIds}
									/>
								),
							)}
							{showRootDropZones && topLevelChildren.length > 0 && (
								<div
									{...bottomUngroupedDropZone.handlers}
									className={cn(
										"h-5",
										getRootDropZoneClassName(
											bottomUngroupedDropZone.isDropTarget,
											bottomUngroupedDropZone.isDragOver,
										),
									)}
								/>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
