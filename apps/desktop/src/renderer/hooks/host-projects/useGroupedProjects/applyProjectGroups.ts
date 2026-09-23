import {
	collectSourceFolderOnlyProjectIds,
	type HostProjectGroup,
	indexProjectGroupsByPrimaryProjectId,
} from "renderer/hooks/host-projects/useHostProjectGroups/useHostProjectGroups.utils";

export type GroupedProject<Project> = Project & {
	groupId: string | null;
	repoCount: number;
};

/**
 * The id a grouped list renders a project under: a source folder resolves to
 * the Project that owns it, since `applyProjectGroups` drops the folder's own
 * row.
 */
export function resolvePrimaryProjectId(
	groups: HostProjectGroup[],
	projectId: string,
): string {
	if (indexProjectGroupsByPrimaryProjectId(groups).has(projectId)) {
		return projectId;
	}
	const owner = groups.find((group) =>
		group.members.some((member) => member.projectId === projectId),
	);
	const primary = owner?.members.find((member) => member.position === 0);
	return primary?.projectId ?? projectId;
}

/**
 * A project assembled out of local folders has no remote of its own to draw an
 * avatar from, so it falls through to its source folders rather than to the
 * letter tile.
 */
export function inheritedProjectIconUrl(
	group: HostProjectGroup,
	iconUrlByProjectId: Map<string, string | null | undefined>,
): string | null {
	for (const member of group.members) {
		const iconUrl = iconUrlByProjectId.get(member.projectId);
		if (iconUrl) return iconUrl;
	}
	return null;
}

export function applyProjectGroups<
	Project extends { id: string; name: string; iconUrl?: string | null },
>(projects: Project[], groups: HostProjectGroup[]): GroupedProject<Project>[] {
	const groupByPrimaryProjectId = indexProjectGroupsByPrimaryProjectId(groups);
	const sourceFolderOnlyProjectIds = collectSourceFolderOnlyProjectIds(groups);
	const iconUrlByProjectId = new Map(
		projects.map((project) => [project.id, project.iconUrl]),
	);

	return projects.flatMap((project): GroupedProject<Project>[] => {
		if (sourceFolderOnlyProjectIds.has(project.id)) return [];
		const group = groupByPrimaryProjectId.get(project.id);
		if (!group) return [{ ...project, groupId: null, repoCount: 1 }];
		return [
			{
				...project,
				name: group.name,
				iconUrl:
					project.iconUrl ?? inheritedProjectIconUrl(group, iconUrlByProjectId),
				groupId: group.id,
				repoCount: group.members.length,
			},
		];
	});
}
