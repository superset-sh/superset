import { useCallback, useEffect, useMemo } from "react";
import { useWorkspaceShortcuts } from "renderer/hooks/useWorkspaceShortcuts";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { MultiDragPreview } from "./MultiDragPreview";
import { PortsList } from "./PortsList";
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

	const projectShortcutIndices = useMemo(
		() =>
			groups.reduce<{ indices: number[]; cumulative: number }>(
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
		[groups],
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
			<WorkspaceSidebarHeader isCollapsed={isCollapsed} />

			{/* biome-ignore lint/a11y/noStaticElementInteractions: mousedown on empty sidebar space clears selection */}
			<div
				className="flex-1 overflow-y-auto hide-scrollbar"
				onMouseDown={handleSidebarMouseDown}
			>
				{groups.map((group, index) => (
					<ProjectSection
						key={group.project.id}
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
						shortcutBaseIndex={projectShortcutIndices[index]}
						index={index}
						isCollapsed={isCollapsed}
					/>
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
