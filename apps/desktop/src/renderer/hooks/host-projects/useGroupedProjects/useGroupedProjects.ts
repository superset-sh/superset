import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { useHostProjectGroups } from "renderer/hooks/host-projects/useHostProjectGroups";
import {
	applyProjectGroups,
	type GroupedProject,
	resolvePrimaryProjectId,
} from "./applyProjectGroups";

export function useGroupedProjects<
	Project extends { id: string; name: string },
>(projects: Project[]): GroupedProject<Project>[] {
	const isMultiRepoEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MULTI_REPO_PROJECTS) ??
		import.meta.env.DEV;
	const { groups } = useHostProjectGroups({ enabled: isMultiRepoEnabled });

	return useMemo(
		() => applyProjectGroups(projects, isMultiRepoEnabled ? groups : []),
		[groups, isMultiRepoEnabled, projects],
	);
}

/** The id `useGroupedProjects` renders a project under — see `resolvePrimaryProjectId`. */
export function useGroupedProjectId<Id extends string | null | undefined>(
	projectId: Id,
): Id | string {
	const isMultiRepoEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MULTI_REPO_PROJECTS) ??
		import.meta.env.DEV;
	const { groups } = useHostProjectGroups({ enabled: isMultiRepoEnabled });

	return useMemo(
		() =>
			projectId && isMultiRepoEnabled
				? resolvePrimaryProjectId(groups, projectId)
				: projectId,
		[groups, isMultiRepoEnabled, projectId],
	);
}
