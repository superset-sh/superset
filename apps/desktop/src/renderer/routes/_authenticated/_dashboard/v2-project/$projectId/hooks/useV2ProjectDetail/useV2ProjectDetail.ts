import { useMemo } from "react";
import {
	type AccessibleV2Project,
	useAccessibleV2Projects,
} from "renderer/routes/_authenticated/_dashboard/v2-projects/hooks/useAccessibleV2Projects";
import {
	type AccessibleV2Workspace,
	useAccessibleV2Workspaces,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";

export interface UseV2ProjectDetailResult {
	project: AccessibleV2Project | null;
	workspaces: AccessibleV2Workspace[];
	isLoading: boolean;
}

export function useV2ProjectDetail(
	projectId: string,
): UseV2ProjectDetailResult {
	const allProjects = useAccessibleV2Projects();
	const { all: allWorkspaces } = useAccessibleV2Workspaces();

	const project = useMemo(
		() => allProjects.find((p) => p.id === projectId) ?? null,
		[allProjects, projectId],
	);

	const workspaces = useMemo(
		() =>
			allWorkspaces
				.filter((w) => w.projectId === projectId)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
		[allWorkspaces, projectId],
	);

	return {
		project,
		workspaces,
		// Electric collections hydrate asynchronously; treat "empty project list"
		// as still-loading so we don't flash NotFound before sync completes.
		isLoading: allProjects.length === 0 && project === null,
	};
}
