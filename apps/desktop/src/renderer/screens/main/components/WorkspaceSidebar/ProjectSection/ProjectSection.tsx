import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useDrag, useDrop } from "react-dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useReorderProjects } from "renderer/react-query/projects";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useSectionDropZone } from "../hooks";
import type { SidebarSection, SidebarWorkspace } from "../types";
import { WorkspaceList } from "../WorkspaceList";
import { WorkspaceSection } from "../WorkspaceSection";
import { ProjectHeader } from "./ProjectHeader";

const PROJECT_TYPE = "PROJECT";

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

	const sectionBaseIndices = useMemo(() => {
		const map = new Map<string, number>();
		let offset = shortcutBaseIndex + workspaces.length;
		for (const section of sections) {
			map.set(section.id, offset);
			offset += section.workspaces.length;
		}
		return map;
	}, [shortcutBaseIndex, workspaces.length, sections]);

	const orderedWorkspaceIds = useMemo(() => {
		const ids = workspaces.map((w) => w.id);
		for (const section of sections) {
			for (const w of section.workspaces) {
				ids.push(w.id);
			}
		}
		return ids;
	}, [workspaces, sections]);

	const ungroupedDropZone = useSectionDropZone({
		canAccept: (item) =>
			item.sectionId !== null && item.projectId === projectId,
		targetSectionId: null,
	});

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
					hideImage={hideImage}
					iconUrl={iconUrl}
					isCollapsed={isCollapsed}
					isSidebarCollapsed={isSidebarCollapsed}
					onToggleCollapse={() => toggleProjectCollapsed(projectId)}
					workspaceCount={totalWorkspaceCount}
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
								<WorkspaceList
									workspaces={workspaces}
									shortcutBaseIndex={shortcutBaseIndex}
									sectionId={null}
									sections={sections}
									isCollapsed={isSidebarCollapsed}
									orderedWorkspaceIds={orderedWorkspaceIds}
								/>
								{sections.map((section, sectionIndex) => (
									<WorkspaceSection
										key={section.id}
										sectionId={section.id}
										projectId={projectId}
										index={sectionIndex}
										name={section.name}
										isCollapsed={section.isCollapsed}
										workspaces={section.workspaces}
										shortcutBaseIndex={sectionBaseIndices.get(section.id) ?? 0}
										isSidebarCollapsed
										allSections={sections}
										orderedWorkspaceIds={orderedWorkspaceIds}
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
				hideImage={hideImage}
				iconUrl={iconUrl}
				isCollapsed={isCollapsed}
				isSidebarCollapsed={isSidebarCollapsed}
				onToggleCollapse={() => toggleProjectCollapsed(projectId)}
				workspaceCount={totalWorkspaceCount}
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
							<div
								{...ungroupedDropZone.handlers}
								className={cn(
									"transition-colors rounded-sm",
									ungroupedDropZone.isDropTarget &&
										!ungroupedDropZone.isDragOver &&
										"border border-dashed border-primary/20",
									(ungroupedDropZone.isDropTarget ||
										ungroupedDropZone.isDragOver) &&
										workspaces.length === 0 &&
										"min-h-8",
									ungroupedDropZone.isDragOver &&
										"bg-primary/5 border-solid border-primary/30",
								)}
							>
								<WorkspaceList
									workspaces={workspaces}
									shortcutBaseIndex={shortcutBaseIndex}
									sectionId={null}
									sections={sections}
									orderedWorkspaceIds={orderedWorkspaceIds}
								/>
							</div>
							{sections.map((section, sectionIndex) => (
								<WorkspaceSection
									key={section.id}
									sectionId={section.id}
									projectId={projectId}
									index={sectionIndex}
									name={section.name}
									isCollapsed={section.isCollapsed}
									color={section.color}
									workspaces={section.workspaces}
									shortcutBaseIndex={sectionBaseIndices.get(section.id) ?? 0}
									allSections={sections}
									orderedWorkspaceIds={orderedWorkspaceIds}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
