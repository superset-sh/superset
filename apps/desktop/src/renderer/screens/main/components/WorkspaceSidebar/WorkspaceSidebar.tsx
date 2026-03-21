import { useCallback, useEffect, useMemo } from "react";
import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import { groupProjectsBySidebarGroups } from "renderer/screens/main/components/WorkspaceSidebar/utils/groupProjectsBySidebarGroups";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { useProjectGroupsStore } from "renderer/stores/project-groups-state";
import { MultiDragPreview } from "./MultiDragPreview";
import { PortsList } from "./PortsList";
import { ProjectGroupSection } from "./ProjectGroupSection";
import { ProjectSection } from "./ProjectSection";
import { SetupScriptCard } from "./SetupScriptCard";
import { SidebarDropZone } from "./SidebarDropZone";
import { WorkspaceSidebarFooter } from "./WorkspaceSidebarFooter";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";

interface WorkspaceSidebarProps {
	isCollapsed?: boolean;
	activeProjectId: string | null;
	activeProjectName: string | null;
}

export function WorkspaceSidebar({
	isCollapsed = false,
	activeProjectId,
	activeProjectName,
}: WorkspaceSidebarProps) {
	const { groups } = useWorkspaceShortcuts();
	const clearSelection = useWorkspaceSelectionStore((s) => s.clearSelection);
	const projectGroups = useProjectGroupsStore((state) => state.groups);
	const projectAssignments = useProjectGroupsStore(
		(state) => state.projectAssignments,
	);
	const createProjectGroup = useProjectGroupsStore((state) => state.createGroup);
	const renameProjectGroup = useProjectGroupsStore((state) => state.renameGroup);
	const deleteProjectGroup = useProjectGroupsStore((state) => state.deleteGroup);
	const setProjectGroup = useProjectGroupsStore((state) => state.setProjectGroup);
	const toggleProjectGroupCollapsed = useProjectGroupsStore(
		(state) => state.toggleGroupCollapsed,
	);

	const groupedProjects = useMemo(
		() =>
			groupProjectsBySidebarGroups({
				projectGroups,
				projectAssignments,
				projects: groups,
			}),
		[groups, projectAssignments, projectGroups],
	);

	const projectShortcutIndices = useMemo(
		() =>
				groupedProjects
					.flatMap((bucket) => bucket.projects)
					.reduce<{ indices: number[]; cumulative: number }>(
						(acc, group) => ({
					indices: [...acc.indices, acc.cumulative],
					cumulative:
						acc.cumulative +
						group.workspaces.length +
						(group.sections ?? []).reduce(
							(sum, s) => sum + s.workspaces.length,
							0,
						),
						}),
						{ indices: [], cumulative: 0 },
					).indices,
		[groupedProjects],
	);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (
					(e.target as HTMLElement).closest(
						"input, textarea, [contenteditable]",
					)
				)
					return;
				clearSelection();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [clearSelection]);

	const handleSidebarMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (
				(e.target as HTMLElement).closest("[role='button'], button, a, input")
			) {
				return;
			}
			clearSelection();
		},
		[clearSelection],
	);

	return (
		<SidebarDropZone className="flex flex-col h-full bg-muted/45 dark:bg-muted/35">
			<WorkspaceSidebarHeader
				isCollapsed={isCollapsed}
				onCreateProjectGroup={() => createProjectGroup()}
			/>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: mousedown on empty sidebar space clears selection */}
			<div
				className="flex-1 overflow-y-auto hide-scrollbar"
				onMouseDown={handleSidebarMouseDown}
			>
				{groupedProjects.map((projectGroup) => (
					<ProjectGroupSection
						key={projectGroup.id}
						groupId={projectGroup.id}
						name={projectGroup.name}
						projectCount={projectGroup.projectCount}
						workspaceCount={projectGroup.workspaceCount}
						isCollapsed={projectGroup.isCollapsed}
						isDefault={projectGroup.isDefault}
						onToggleCollapse={() =>
							toggleProjectGroupCollapsed(projectGroup.id)
						}
						onRename={(name) => renameProjectGroup(projectGroup.id, name)}
						onDelete={() => deleteProjectGroup(projectGroup.id)}
						onProjectDrop={(projectId) =>
							setProjectGroup(
								projectId,
								projectGroup.id === "__ungrouped__"
									? "__ungrouped__"
									: projectGroup.id,
							)
						}
						onAddProject={(projectId) =>
							setProjectGroup(
								projectId,
								projectGroup.id === "__ungrouped__"
									? "__ungrouped__"
									: projectGroup.id,
							)
						}
						availableProjects={groups
							.filter((group) => {
								const assignment = projectAssignments[group.project.id] ?? "current";
								return assignment !== projectGroup.id;
							})
							.map((group) => ({
								id: group.project.id,
								name: group.project.name,
							}))}
					>
						{projectGroup.projects.map((group, index) => {
							const globalIndex = groups.findIndex(
								(candidate) => candidate.project.id === group.project.id,
							);
							return (
								<ProjectSection
									key={group.project.id}
									projectGroupId={projectGroup.id}
									projectId={group.project.id}
									projectName={group.project.name}
									projectColor={group.project.color}
									githubOwner={group.project.githubOwner}
									mainRepoPath={group.project.mainRepoPath}
									hideImage={group.project.hideImage}
									iconUrl={group.project.iconUrl}
									workspaces={group.workspaces}
									sections={group.sections ?? []}
									topLevelItems={group.topLevelItems}
									shortcutBaseIndex={projectShortcutIndices[globalIndex] ?? index}
									index={globalIndex >= 0 ? globalIndex : index}
									isCollapsed={isCollapsed}
									onMoveToProjectGroup={(projectId, groupId) =>
										setProjectGroup(
											projectId,
											groupId === "__ungrouped__" ? "__ungrouped__" : groupId,
										)
									}
								/>
							);
						})}
					</ProjectGroupSection>
				))}

				{groups.length === 0 && !isCollapsed && (
					<div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
						<span>No workspaces yet</span>
						<span className="text-xs mt-1">
							Add project or drag a Git repo folder here
						</span>
					</div>
				)}
			</div>

			{!isCollapsed && <PortsList />}

			<SetupScriptCard
				isCollapsed={isCollapsed}
				projectId={activeProjectId}
				projectName={activeProjectName}
			/>

			<WorkspaceSidebarFooter isCollapsed={isCollapsed} />
			<MultiDragPreview />
		</SidebarDropZone>
	);
}
