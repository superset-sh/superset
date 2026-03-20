import { useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ProjectSection } from "../../../WorkspaceSidebar/ProjectSection";

interface ProjectFocusBarProps {
	projectId: string;
}

/**
 * Renders the exact same ProjectSection from the sidebar above the tabs
 * in project-focused windows. Shows the project header with status indicators
 * and nested worktrees when worktree mode is enabled.
 */
export function ProjectFocusBar({ projectId }: ProjectFocusBarProps) {
	const { data: groups = [] } =
		electronTrpc.workspaces.getAllGrouped.useQuery();

	const group = useMemo(
		() => groups.find((g) => g.project.id === projectId),
		[groups, projectId],
	);

	if (!group) return null;

	return (
		<div className="shrink-0 border-b overflow-y-auto max-h-48">
			<ProjectSection
				projectId={group.project.id}
				projectName={group.project.name}
				projectColor={group.project.color}
				githubOwner={group.project.githubOwner}
				mainRepoPath={group.project.mainRepoPath}
				hideImage={group.project.hideImage}
				iconUrl={group.project.iconUrl}
				worktreeMode={group.project.worktreeMode}
				workspaces={group.workspaces}
				sections={group.sections ?? []}
				topLevelItems={group.topLevelItems}
				shortcutBaseIndex={0}
				index={0}
			/>
		</div>
	);
}
